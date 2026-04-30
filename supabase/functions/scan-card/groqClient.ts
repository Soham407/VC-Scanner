import Groq from "npm:groq-sdk";

const MODEL = "llama-3.1-8b-instant";

type CreateJsonCompletionParams = {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
};

export async function createJsonCompletion(
  params: CreateJsonCompletionParams,
): Promise<unknown> {
  const client = new Groq({ apiKey: params.apiKey });

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
  });

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
