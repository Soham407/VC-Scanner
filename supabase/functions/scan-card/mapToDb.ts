import type { ParsedCard } from "./parsedCardSchema.ts";

export type ParsedCardDbRow = {
  full_name: string | null;
  job_title: string | null;
  company_name: string | null;
  address: string | null;
  email: string | null;
  phone_number: string | null;
};

export function mapToDb(parsed: ParsedCard): ParsedCardDbRow {
  return {
    full_name: parsed.fullName,
    job_title: parsed.jobTitle,
    company_name: parsed.companyName,
    address: parsed.address,
    email: parsed.email,
    phone_number: parsed.phoneNumber,
  };
}
