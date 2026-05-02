import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";
import { createJsonCompletion } from "./groqClient.ts";
import { mapToDb } from "./mapToDb.ts";
import {
  coerceParsedCard,
  getParseStatus,
} from "./parsedCardSchema.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const STORAGE_BUCKET = "card-images";

const requestSchema = z.object({
  rawText: z.string().min(1),
  imagePath: z.string().min(1),
  leadId: z.string().uuid(),
  boothId: z.string().uuid().nullable().optional(),
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
  if (imagePath.startsWith(`${STORAGE_BUCKET}/`)) {
    return imagePath.slice(STORAGE_BUCKET.length + 1);
  }

  return imagePath;
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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
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
    const groqApiKey = requireEnv("GROQ_API_KEY", GROQ_API_KEY);

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

    const downloadPath = normalizeStoragePath(bodyResult.data.imagePath);
    const { data: imageBlob, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(downloadPath);

    if (downloadError || !imageBlob) {
      return jsonResponse({ ok: false, error: "Image download failed" }, 500);
    }

    const imageBase64 = arrayBufferToBase64(await imageBlob.arrayBuffer());
    const llmPayload = await createJsonCompletion({
      apiKey: groqApiKey,
      rawText: bodyResult.data.rawText,
      imageDataUrl: `data:${imageBlob.type || "image/jpeg"};base64,${imageBase64}`,
    });

    const parsed = coerceParsedCard(llmPayload);
    const parseStatus = getParseStatus(parsed);

    const dbFields = mapToDb(parsed);

    const { error: insertError } = await supabase
      .from("scanned_leads")
      .insert({
        id: bodyResult.data.leadId,
        user_id: userData.user.id,
        booth_id: bodyResult.data.boothId ?? null,
        ...dbFields,
        image_url: downloadPath,
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
});
