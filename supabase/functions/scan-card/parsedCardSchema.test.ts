import { assertEquals } from "jsr:@std/assert";
import {
  coerceParsedCard,
  getParseStatus,
  parsedCardSchema,
  type ParsedCard,
} from "./parsedCardSchema.ts";

const EMPTY: ParsedCard = {
  fullName: null,
  jobTitle: null,
  companyName: null,
  productServices: null,
  address: null,
  email: null,
  phoneNumber: null,
};

Deno.test("parsedCardSchema: parses well-formed object", () => {
  const parsed = parsedCardSchema.parse({
    fullName: "Ada Lovelace",
    jobTitle: "Engineer",
    companyName: "Analytical Engines",
    productServices: "Mechanical computers",
    address: "1 Engine Way",
    email: "ada@example.com",
    phoneNumber: "+1 111 222 3333",
  });

  assertEquals(parsed, {
    fullName: "Ada Lovelace",
    jobTitle: "Engineer",
    companyName: "Analytical Engines",
    productServices: "Mechanical computers",
    address: "1 Engine Way",
    email: "ada@example.com",
    phoneNumber: "+1 111 222 3333",
  });
  assertEquals(getParseStatus(parsed), "parsed");
});

Deno.test("parsedCardSchema: coerces array values to first element", () => {
  const parsed = parsedCardSchema.parse({
    fullName: ["Ada Lovelace", "A. Lovelace"],
    phoneNumber: ["+1 123", "+1 456"],
  });

  assertEquals(parsed, {
    ...EMPTY,
    fullName: "Ada Lovelace",
    phoneNumber: "+1 123",
  });
  assertEquals(getParseStatus(parsed), "parsed");
});

Deno.test("parsedCardSchema: coerces numeric values to strings", () => {
  const parsed = parsedCardSchema.parse({
    phoneNumber: 1234567890,
  });

  assertEquals(parsed, {
    ...EMPTY,
    phoneNumber: "1234567890",
  });
  assertEquals(getParseStatus(parsed), "unparsed");
});

Deno.test("parsedCardSchema: missing keys become null", () => {
  const parsed = parsedCardSchema.parse({
    companyName: "ACME",
  });

  assertEquals(parsed, {
    ...EMPTY,
    companyName: "ACME",
  });
  assertEquals(getParseStatus(parsed), "parsed");
});

Deno.test("parsedCardSchema: drops extra keys", () => {
  const parsed = parsedCardSchema.parse({
    fullName: "Grace Hopper",
    favoriteColor: "blue",
  });

  assertEquals(parsed, {
    ...EMPTY,
    fullName: "Grace Hopper",
  });
  assertEquals(Object.keys(parsed).sort(), [
    "address",
    "companyName",
    "email",
    "fullName",
    "jobTitle",
    "phoneNumber",
    "productServices",
  ]);
  assertEquals(getParseStatus(parsed), "parsed");
});

Deno.test("parsedCardSchema: all-null payload yields unparsed", () => {
  const parsed = parsedCardSchema.parse({
    fullName: null,
    jobTitle: null,
    companyName: null,
    productServices: null,
    address: null,
    email: null,
    phoneNumber: null,
  });

  assertEquals(parsed, EMPTY);
  assertEquals(getParseStatus(parsed), "unparsed");
});

Deno.test("getParseStatus: suspicious company labels need review", () => {
  assertEquals(
    getParseStatus({
      ...EMPTY,
      companyName: "Corporate Office",
      fullName: "Prabhat A Deshpande",
    }),
    "unparsed",
  );
});

Deno.test("getParseStatus: job title in fullName needs review", () => {
  assertEquals(
    getParseStatus({
      ...EMPTY,
      companyName: "Savemax",
      fullName: "Owner",
    }),
    "unparsed",
  );
});

Deno.test("getParseStatus: separated Indian card fields are parsed", () => {
  assertEquals(
    getParseStatus({
      ...EMPTY,
      companyName: "Savemax",
      fullName: "Prabhat A Deshpande",
      jobTitle: "Proprietor",
    }),
    "parsed",
  );
});

Deno.test("parsedCardSchema: empty object yields all null and unparsed", () => {
  const parsed = parsedCardSchema.parse({});

  assertEquals(parsed, EMPTY);
  assertEquals(getParseStatus(parsed), "unparsed");
});

Deno.test(
  "parsedCardSchema: non-object payload still normalizes to all-null and unparsed",
  () => {
    const parsed = coerceParsedCard("not-an-object");

    assertEquals(parsed, EMPTY);
    assertEquals(getParseStatus(parsed), "unparsed");
  },
);

Deno.test(
  "parsedCardSchema: non-coercible object values normalize to all-null and unparsed",
  () => {
    const parsed = coerceParsedCard({
      fullName: { first: "Ada" },
      jobTitle: true,
      companyName: false,
      productServices: { category: "Engines" },
      address: { line1: "1 Engine Way" },
      email: { value: "ada@example.com" },
      phoneNumber: { countryCode: "+1", local: "1234567" },
    });

    assertEquals(parsed, EMPTY);
    assertEquals(getParseStatus(parsed), "unparsed");
  },
);
