import Groq from "npm:groq-sdk";
import {
  buildCardExtractionRequest,
} from "./extractionPrompt.ts";

type CreateJsonCompletionParams = {
  apiKey: string;
  rawText: string;
  imageDataUrl: string;
};

export async function createJsonCompletion(
  params: CreateJsonCompletionParams,
): Promise<unknown> {
  const client = new Groq({ apiKey: params.apiKey });

  const response = await client.chat.completions.create(
    buildCardExtractionRequest({
      rawText: params.rawText,
      imageDataUrl: params.imageDataUrl,
    }),
  );

  const content = response.choices[0]?.message?.content;

  if (typeof content !== "string") {
    return {};
  }

  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}
