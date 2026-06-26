import { CARD_EXTRACTION_SYSTEM_PROMPT } from "./extractionPrompt.ts";

export const GEMINI_CARD_EXTRACTION_MODEL = "gemini-2.5-flash-lite";

type CreateGeminiCompletionParams = {
  apiKey: string;
  rawText: string;
  imageDataUrls: string[];
};

type GeminiInlinePart = {
  inlineData: { mimeType: string; data: string };
};

// Splits a `data:image/jpeg;base64,XXXX` URL into Gemini's inlineData shape.
function dataUrlToInlinePart(dataUrl: string): GeminiInlinePart {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Unsupported image data URL for Gemini");
  }

  return { inlineData: { mimeType: match[1], data: match[2] } };
}

// Throws on any failure so the caller can fall back to Groq. A successful but
// empty extraction returns {} and is kept (same as a genuinely unreadable card).
export async function createGeminiJsonCompletion(
  params: CreateGeminiCompletionParams,
): Promise<unknown> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CARD_EXTRACTION_MODEL}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": params.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: CARD_EXTRACTION_SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `Extract the fields from this business card. If two sides are supplied, merge them into one contact.\n\nOCR text:\n${params.rawText}`,
            },
            ...params.imageDataUrls.map(dataUrlToInlinePart),
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 500,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`Gemini request failed: ${response.status} ${detail}`.trim());
    (error as { status?: number }).status = response.status;
    throw error;
  }

  const payload = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) {
    throw new Error(`Gemini returned no content (finishReason: ${candidate?.finishReason ?? "unknown"})`);
  }

  return JSON.parse(text);
}
