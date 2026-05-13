import { assertEquals } from "jsr:@std/assert";
import type { ParsedCard } from "./parsedCardSchema.ts";
import { mapToDb } from "./mapToDb.ts";

Deno.test("mapToDb: maps every key when present", () => {
  const parsed: ParsedCard = {
    fullName: "Ada Lovelace",
    jobTitle: "Engineer",
    companyName: "Analytical Engines",
    productServices: "Mechanical computers",
    address: "1 Engine Way",
    email: "ada@example.com",
    phoneNumber: "+1 111 222 3333",
  };

  assertEquals(mapToDb(parsed), {
    full_name: "Ada Lovelace",
    job_title: "Engineer",
    company_name: "Analytical Engines",
    product_services: "Mechanical computers",
    address: "1 Engine Way",
    email: "ada@example.com",
    phone_number: "+1 111 222 3333",
  });
});

Deno.test("mapToDb: preserves null values", () => {
  const parsed: ParsedCard = {
    fullName: "Ada Lovelace",
    jobTitle: null,
    companyName: null,
    productServices: null,
    address: null,
    email: "ada@example.com",
    phoneNumber: null,
  };

  assertEquals(mapToDb(parsed), {
    full_name: "Ada Lovelace",
    job_title: null,
    company_name: null,
    product_services: null,
    address: null,
    email: "ada@example.com",
    phone_number: null,
  });
});

Deno.test("mapToDb: all null output has no extra keys", () => {
  const parsed: ParsedCard = {
    fullName: null,
    jobTitle: null,
    companyName: null,
    productServices: null,
    address: null,
    email: null,
    phoneNumber: null,
  };

  const dbRow = mapToDb(parsed);

  assertEquals(dbRow, {
    full_name: null,
    job_title: null,
    company_name: null,
    product_services: null,
    address: null,
    email: null,
    phone_number: null,
  });
  assertEquals(Object.keys(dbRow).sort(), [
    "address",
    "company_name",
    "email",
    "full_name",
    "job_title",
    "phone_number",
    "product_services",
  ]);
});
