import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  CARD_EXTRACTION_MODEL,
  CARD_EXTRACTION_SYSTEM_PROMPT,
  buildCardExtractionRequest,
} from "./extractionPrompt.ts";

Deno.test("buildCardExtractionRequest: includes image and OCR text", () => {
  const request = buildCardExtractionRequest({
    rawText: "Savemax\nPrabhat A Deshpande\nManufacturing Unit & Corporate Office",
    imageDataUrls: ["data:image/jpeg;base64,abc123"],
  });

  assertEquals(request.model, CARD_EXTRACTION_MODEL);
  assertStringIncludes(request.messages[0].content as string, "business card");

  const userContent = request.messages[1].content as Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  >;
  const textPart = userContent[0] as { type: "text"; text: string };
  const imagePart = userContent[1] as { type: "image_url"; image_url: { url: string } };

  assertStringIncludes(textPart.text, "Savemax");
  assertStringIncludes(textPart.text, "Manufacturing Unit");
  assertEquals(imagePart.type, "image_url");
  assertEquals(imagePart.image_url.url, "data:image/jpeg;base64,abc123");
});

Deno.test("buildCardExtractionRequest: prompt separates company from address", () => {
  assertStringIncludes(CARD_EXTRACTION_SYSTEM_PROMPT, "companyName");
  assertStringIncludes(CARD_EXTRACTION_SYSTEM_PROMPT, "productServices");
  assertStringIncludes(CARD_EXTRACTION_SYSTEM_PROMPT, "what the business sells or provides");
  assertStringIncludes(CARD_EXTRACTION_SYSTEM_PROMPT, "address");
  assertStringIncludes(CARD_EXTRACTION_SYSTEM_PROMPT, "Corporate Office");
  assertStringIncludes(CARD_EXTRACTION_SYSTEM_PROMPT, "Treat OCR text as noisy");
  assertStringIncludes(CARD_EXTRACTION_SYSTEM_PROMPT, "fullName is the person");
  assertStringIncludes(CARD_EXTRACTION_SYSTEM_PROMPT, "Owner");
  assertStringIncludes(CARD_EXTRACTION_SYSTEM_PROMPT, "double-sided");
});
