type BuildCardExtractionRequestParams = {
  rawText: string;
  imageDataUrl: string;
};

export const CARD_EXTRACTION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export const CARD_EXTRACTION_SYSTEM_PROMPT =
  "You are a structured data extraction API for business cards. Read the card image and the OCR text together, then return ONLY a JSON object with these keys: fullName, jobTitle, companyName, address, email, and phoneNumber. Prefer the actual brand or organization name for companyName. Treat office lines, building names, manufacturing unit labels, street addresses, city names, and pin codes as address unless the same wording is clearly the legal company name. Do not put Corporate Office, Head Office, Registered Office, Factory, or similar location text into companyName unless no better company name exists. If the card contains both a person name and a company name, separate them. Do not include markdown, code fences, or commentary.";

type GroqMessage =
  | {
    role: "system";
    content: string;
  }
  | {
    role: "user";
    content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
  };

export function buildCardExtractionRequest(
  params: BuildCardExtractionRequestParams,
): {
  model: string;
  temperature: number;
  max_tokens: number;
  response_format: { type: "json_object" };
  messages: GroqMessage[];
} {
  return {
    model: CARD_EXTRACTION_MODEL,
    temperature: 0,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: CARD_EXTRACTION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Extract the fields from this business card.\n\nOCR text:\n${params.rawText}`,
          },
          {
            type: "image_url",
            image_url: { url: params.imageDataUrl },
          },
        ],
      },
    ],
  };
}
