import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleScanCardRequest } from "./index.ts";

Deno.test("scan-card responds to CORS preflight", async () => {
  const response = await handleScanCardRequest(new Request("https://example.test/scan-card", {
    method: "OPTIONS",
  }));

  assertEquals(response.status, 204);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assertEquals(
    response.headers.get("Access-Control-Allow-Headers"),
    "authorization, x-client-info, apikey, content-type",
  );
});

Deno.test("scan-card error responses include CORS headers", async () => {
  const response = await handleScanCardRequest(new Request("https://example.test/scan-card", {
    method: "GET",
  }));

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
});
