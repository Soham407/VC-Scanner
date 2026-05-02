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

const SYSTEM_PROMPT = "You are a data extraction API. Parse the following OCR text from a business card and return ONLY a JSON object with the keys: fullName, jobTitle, companyName, email, and phoneNumber. Do not include markdown formatting or conversational text.";

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

    const llmPayload = await createJsonCompletion({
      apiKey: groqApiKey,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: bodyResult.data.rawText,
    });

    const parsed = coerceParsedCard(llmPayload);
    const parseStatus = getParseStatus(parsed);

    const imageUrlResult = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(bodyResult.data.imagePath);

    const imageUrl = imageUrlResult.data.publicUrl;
    const dbFields = mapToDb(parsed);

    const { error: insertError } = await supabase
      .from("scanned_leads")
      .insert({
        id: bodyResult.data.leadId,
        user_id: userData.user.id,
        booth_id: bodyResult.data.boothId ?? null,
        ...dbFields,
        image_url: imageUrl,
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
    return jsonResponse({ ok: false, error: "Internal server error" }, 500);
  }
});
