import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";
import { createJsonCompletion } from "./groqClient.ts";
import { createGeminiJsonCompletion } from "./geminiClient.ts";
import { mapToDb } from "./mapToDb.ts";
import {
  coerceParsedCard,
  getParseStatus,
} from "./parsedCardSchema.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const STORAGE_BUCKET = "card-images";
const MAX_REQUEST_BODY_BYTES = 1_048_576;
const MAX_RAW_TEXT_LENGTH = 100_000;
const MAX_STORAGE_PATH_LENGTH = 512;
const MAX_STORAGE_PATH_SEGMENTS = 2;
const STORAGE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9-]+$/;
const STORAGE_PATH_FILE_PATTERN = /^[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i;
const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Max-Age": "86400",
};

const requestSchema = z.object({
  action: z.enum(["parse", "save", "saveParsed"]).optional(),
  rawText: z.string().min(1).max(MAX_RAW_TEXT_LENGTH),
  imagePath: z.string().min(1).max(MAX_STORAGE_PATH_LENGTH).refine(
    (value) => isValidStoragePath(normalizeStoragePath(value)),
    { message: "Invalid image path" },
  ),
  imagePaths: z.array(
    z.string().min(1).max(MAX_STORAGE_PATH_LENGTH).refine(
      (value) => isValidStoragePath(normalizeStoragePath(value)),
      { message: "Invalid image path" },
    ),
  ).min(1).max(2).optional(),
  leadId: z.string().uuid(),
  teamId: z.string().uuid().nullable().optional(),
  parsed: z.unknown().optional(),
});

type ErrorPayload = {
  ok: false;
  error: string;
};

function jsonResponse(
  body: Record<string, unknown> | ErrorPayload,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function normalizeStoragePath(imagePath: string): string {
  const trimmedPath = imagePath.trim();

  if (trimmedPath.startsWith(`${STORAGE_BUCKET}/`)) {
    return trimmedPath.slice(STORAGE_BUCKET.length + 1);
  }

  return trimmedPath;
}

function isValidStoragePath(imagePath: string): boolean {
  const normalizedPath = imagePath.trim();
  if (normalizedPath.length === 0 || normalizedPath.length > MAX_STORAGE_PATH_LENGTH) {
    return false;
  }

  if (normalizedPath.startsWith("/") || normalizedPath.includes("\\") || normalizedPath.includes("..")) {
    return false;
  }

  const segments = normalizedPath.split("/");
  if (segments.length !== MAX_STORAGE_PATH_SEGMENTS) {
    return false;
  }

  const [folder, fileName] = segments;
  if (!STORAGE_PATH_SEGMENT_PATTERN.test(folder) || !STORAGE_PATH_FILE_PATTERN.test(fileName)) {
    return false;
  }

  return true;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }

    const errorValue = (error as { error?: unknown }).error;
    if (typeof errorValue === "string" && errorValue.trim().length > 0) {
      return errorValue;
    }
  }

  return "Internal server error";
}

async function parseCardFromImage(params: {
  imageBlobs: Blob[];
  rawText: string;
}): Promise<ReturnType<typeof coerceParsedCard>> {
  const imageDataUrls = await Promise.all(
    params.imageBlobs.map(async (imageBlob) => {
      const imageBase64 = arrayBufferToBase64(await imageBlob.arrayBuffer());
      return `data:${imageBlob.type || "image/jpeg"};base64,${imageBase64}`;
    }),
  );

  // Gemini Flash-Lite is primary (faster + more accurate); Groq is the fallback
  // so a Gemini outage or rate limit never blocks a scan.
  if (GEMINI_API_KEY) {
    try {
      const llmPayload = await createGeminiJsonCompletion({
        apiKey: GEMINI_API_KEY,
        rawText: params.rawText,
        imageDataUrls,
      });
      return coerceParsedCard(llmPayload);
    } catch (error) {
      console.error("gemini parse failed, falling back to groq", error);
    }
  }

  const groqApiKey = requireEnv("GROQ_API_KEY", GROQ_API_KEY);
  const llmPayload = await createJsonCompletion({
    apiKey: groqApiKey,
    rawText: params.rawText,
    imageDataUrls,
  });

  return coerceParsedCard(llmPayload);
}

async function downloadRequestedImages(supabase: any, requestedImagePaths: string[]): Promise<Blob[]> {
  return await Promise.all(requestedImagePaths.map(async (path) => {
    const { data: imageBlob, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(path);

    if (downloadError || !imageBlob) {
      throw new Error("Image download failed");
    }

    return imageBlob;
  }));
}

export async function handleScanCardRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: CORS_HEADERS,
      status: 204,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
      return jsonResponse({ ok: false, error: "Request body too large" }, 413);
    }
  }

  const requestBodyText = await req.text();
  if (new TextEncoder().encode(requestBodyText).byteLength > MAX_REQUEST_BODY_BYTES) {
    return jsonResponse({ ok: false, error: "Request body too large" }, 413);
  }

  let requestBody: unknown;
  try {
    requestBody = JSON.parse(requestBodyText);
  } catch {
    return jsonResponse({ ok: false, error: "Malformed JSON" }, 400);
  }

  const bodyResult = requestSchema.safeParse(requestBody);
  if (!bodyResult.success) {
    return jsonResponse({ ok: false, error: "Invalid request body" }, 400);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL", SUPABASE_URL);
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
    const action = bodyResult.data.action ?? "save";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const requestedImagePaths = bodyResult.data.imagePaths ?? [
      bodyResult.data.imagePath,
    ];
    const downloadPaths = requestedImagePaths.map(normalizeStoragePath);
    const downloadPath = downloadPaths[0];
    const secondaryDownloadPath = downloadPaths[1] ?? null;
    let parsed = bodyResult.data.parsed === undefined
      ? null
      : coerceParsedCard(bodyResult.data.parsed);

    const imageBlobResults = await downloadRequestedImages(supabase, downloadPaths);

    if (action !== "saveParsed") {
      parsed = await parseCardFromImage({
        imageBlobs: imageBlobResults,
        rawText: bodyResult.data.rawText,
      });
    }

    if (!parsed) {
      return jsonResponse({ ok: false, error: "Missing parsed card" }, 400);
    }

    const parseStatus = getParseStatus(parsed);

    if (action === "parse") {
      return jsonResponse({
        ok: true,
        leadId: bodyResult.data.leadId,
        parsed,
        parseStatus,
      });
    }

    const dbFields = mapToDb(parsed);

    const { error: insertError } = await supabase
      .from("scanned_leads")
      .insert({
        id: bodyResult.data.leadId,
        user_id: userData.user.id,
        team_id: bodyResult.data.teamId ?? null,
        ...dbFields,
        image_url: downloadPath,
        secondary_image_url: secondaryDownloadPath,
        raw_ocr_text: bodyResult.data.rawText,
        parse_status: parseStatus,
      });

    if (insertError) {
      return jsonResponse({ ok: false, error: "Insert failed" }, 500);
    }

    return jsonResponse({
      ok: true,
      leadId: bodyResult.data.leadId,
      parsed,
      parseStatus,
    });
  } catch (error) {
    console.error("scan-card failed", error);
    return jsonResponse({ ok: false, error: getErrorMessage(error) }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handleScanCardRequest);
}
