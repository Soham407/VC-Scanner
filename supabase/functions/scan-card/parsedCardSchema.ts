import { z } from "npm:zod";

export type ParseStatus = "parsed" | "unparsed";

export type ParsedCard = {
  fullName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  email: string | null;
  phoneNumber: string | null;
};

export const EMPTY_PARSED_CARD: ParsedCard = {
  fullName: null,
  jobTitle: null,
  companyName: null,
  email: null,
  phoneNumber: null,
};

function coerceToNullableString(value: unknown): string | null {
  let normalized = value;

  if (Array.isArray(normalized)) {
    normalized = normalized.length > 0 ? normalized[0] : null;
  }

  if (normalized === null || normalized === undefined) {
    return null;
  }

  if (typeof normalized === "number") {
    return String(normalized);
  }

  if (typeof normalized === "string") {
    const trimmed = normalized.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export const parsedCardSchema = z.preprocess((input) => {
  const source = asRecord(input);

  return {
    fullName: coerceToNullableString(source.fullName),
    jobTitle: coerceToNullableString(source.jobTitle),
    companyName: coerceToNullableString(source.companyName),
    email: coerceToNullableString(source.email),
    phoneNumber: coerceToNullableString(source.phoneNumber),
  };
}, z.object({
  fullName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  companyName: z.string().nullable(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
}).strip());

export function coerceParsedCard(input: unknown): ParsedCard {
  const result = parsedCardSchema.safeParse(input);

  if (!result.success) {
    return { ...EMPTY_PARSED_CARD };
  }

  return result.data;
}

export function getParseStatus(parsed: ParsedCard): ParseStatus {
  const hasData = Object.values(parsed).some((value) => value !== null);
  return hasData ? "parsed" : "unparsed";
}
