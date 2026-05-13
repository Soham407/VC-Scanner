type BuildCardExtractionRequestParams = {
  rawText: string;
  imageDataUrls: string[];
};

export const CARD_EXTRACTION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export const CARD_EXTRACTION_SYSTEM_PROMPT =
  "You are a structured data extraction API for Indian business card and visiting card scans. Read all supplied card images and the OCR text together. Some cards are double-sided: combine the front and back sides into one contact record, using the back side for addresses, alternate phone numbers, emails, services, QR-adjacent details, and branch information when present. Treat OCR text as noisy: correct obvious OCR mistakes only when an image supports the correction, ignore stray symbols, and do not invent missing details. Return ONLY a JSON object with these keys: fullName, jobTitle, companyName, productServices, address, email, and phoneNumber. fullName is the person or card owner, not the business. Words like Owner, Proprietor, Director, Founder, Partner, Manager, CEO, Sales, Marketing, and Consultant are jobTitle clues. companyName is the actual business, brand, shop, firm, hospital, manufacturer, or organization name. productServices is what the business sells or provides, such as product categories, services, specializations, treatments, manufactured goods, or offerings shown on the card. Treat Corporate Office, Head Office, Registered Office, Factory, Manufacturing Unit, branch labels, street addresses, city names, states, and pin codes as address unless the same wording is clearly the legal company name. If the card contains both a person name and a company name, separate them. If a line could be either a person or company, prefer visual hierarchy from the image and Indian name patterns; do not put a person's name in companyName. Do not include markdown, code fences, or commentary.";

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
  const imageParts = params.imageDataUrls.map((imageDataUrl) => ({
    type: "image_url" as const,
    image_url: { url: imageDataUrl },
  }));

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
              `Extract the fields from this business card. If two sides are supplied, merge them into one contact.\n\nOCR text:\n${params.rawText}`,
          },
          ...imageParts,
        ],
      },
    ],
  };
}
