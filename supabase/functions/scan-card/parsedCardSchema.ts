import { z } from "npm:zod";

export type ParseStatus = "parsed" | "unparsed";

export type ParsedCard = {
  fullName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  productServices: string | null;
  address: string | null;
  email: string | null;
  phoneNumber: string | null;
};

export const EMPTY_PARSED_CARD: ParsedCard = {
  fullName: null,
  jobTitle: null,
  companyName: null,
  productServices: null,
  address: null,
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

function compact(value: string | null): string {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function looksLikeMostlySymbols(value: string): boolean {
  const alphaNumericCount = (value.match(/[A-Za-z0-9]/g) ?? []).length;
  if (alphaNumericCount === 0) {
    return true;
  }

  const symbolCount = (value.match(/[^A-Za-z0-9\s@.+,&()/#:-]/g) ?? []).length;
  return symbolCount > alphaNumericCount;
}

function looksLikeNonCompanyLabel(value: string): boolean {
  return /\b(corporate office|head office|registered office|manufacturing unit|factory|branch|address)\b/i
    .test(value);
}

function looksLikeJobTitle(value: string): boolean {
  return /\b(owner|proprietor|director|founder|partner|manager|consultant|sales|marketing|ceo|cto|coo)\b/i
    .test(value);
}

export const parsedCardSchema = z.preprocess((input) => {
  const source = asRecord(input);

  return {
    fullName: coerceToNullableString(source.fullName),
    jobTitle: coerceToNullableString(source.jobTitle),
    companyName: coerceToNullableString(source.companyName),
    productServices: coerceToNullableString(source.productServices),
    address: coerceToNullableString(source.address),
    email: coerceToNullableString(source.email),
    phoneNumber: coerceToNullableString(source.phoneNumber),
  };
}, z.object({
  fullName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  companyName: z.string().nullable(),
  productServices: z.string().nullable(),
  address: z.string().nullable(),
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
  if (!hasData) {
    return "unparsed";
  }

  const values = [
    parsed.fullName,
    parsed.jobTitle,
    parsed.companyName,
    parsed.productServices,
    parsed.address,
    parsed.email,
    parsed.phoneNumber,
  ].filter((value): value is string => value !== null);

  if (values.some(looksLikeMostlySymbols)) {
    return "unparsed";
  }

  if (!parsed.fullName && !parsed.companyName) {
    return "unparsed";
  }

  if (parsed.companyName && looksLikeNonCompanyLabel(parsed.companyName)) {
    return "unparsed";
  }

  if (parsed.fullName && looksLikeJobTitle(parsed.fullName)) {
    return "unparsed";
  }

  if (
    parsed.fullName &&
    parsed.companyName &&
    compact(parsed.fullName) === compact(parsed.companyName)
  ) {
    return "unparsed";
  }

  return "parsed";
}
