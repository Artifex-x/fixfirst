import test from "node:test";
import assert from "node:assert/strict";
import { POST, buildRetestResult, createScanHandler, scannerTransportForRuntime } from "../app/api/scan/route.js";
import { resetRateLimitForTests } from "../lib/scanner/rate-limit.js";

let addressIndex = 1;

function apiRequest(body, { contentType = "application/json", origin, headers = {} } = {}) {
  addressIndex += 1;
  const requestHeaders = new Headers({ "x-real-ip": `198.51.100.${addressIndex}`, ...headers });
  if (contentType) requestHeaders.set("content-type", contentType);
  if (origin) requestHeaders.set("origin", origin);
  return new Request("https://fixfirst.local/api/scan", { method: "POST", headers: requestHeaders, body });
}

async function responseCode(response) {
  return (await response.json()).error;
}

test("rejects cross-origin, unsupported, malformed, and oversized requests", async () => {
  resetRateLimitForTests();
  const crossOrigin = await POST(apiRequest("{}", { origin: "https://untrusted.example" }));
  assert.equal(crossOrigin.status, 403);
  assert.equal(await responseCode(crossOrigin), "CROSS_ORIGIN_REQUEST");

  const unsupported = await POST(apiRequest("{}", { contentType: "text/plain" }));
  assert.equal(unsupported.status, 415);
  assert.equal(await responseCode(unsupported), "UNSUPPORTED_MEDIA_TYPE");

  const malformed = await POST(apiRequest("{"));
  assert.equal(malformed.status, 400);
  assert.equal(await responseCode(malformed), "INVALID_REQUEST");

  const oversized = await POST(apiRequest("{}", { headers: { "content-length": "9000" } }));
  assert.equal(oversized.status, 413);
  assert.equal(await responseCode(oversized), "PAYLOAD_TOO_LARGE");
});

test("requires authorization and rejects unsafe targets before fetching", async () => {
  resetRateLimitForTests();
  const unauthorized = await POST(apiRequest(JSON.stringify({ url: "https://example.net" })));
  assert.equal(unauthorized.status, 403);
  assert.equal(await responseCode(unauthorized), "AUTHORIZATION_REQUIRED");

  const blocked = await POST(apiRequest(JSON.stringify({ url: "http://127.0.0.1", authorized: true }), { origin: "https://fixfirst.local" }));
  assert.equal(blocked.status, 400);
  assert.equal(await responseCode(blocked), "BLOCKED_TARGET");

  const invalidRetest = await POST(apiRequest(JSON.stringify({ url: "https://public.example.net", authorized: true, retestCode: "unknown" })));
  assert.equal(invalidRetest.status, 400);
  assert.equal(await responseCode(invalidRetest), "INVALID_REQUEST");
  assert.equal(invalidRetest.headers.get("cache-control"), "no-store");
  assert.equal(invalidRetest.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  assert.equal(invalidRetest.headers.get("strict-transport-security"), "max-age=31536000");
  assert.equal(invalidRetest.headers.get("x-content-type-options"), "nosniff");
});

test("only marks a retest fixed when the same check conclusively passes", () => {
  assert.deepEqual(buildRetestResult("csp_missing", { csp_missing: { status: "pass", basis: "direct_response_header" } }), {
    code: "csp_missing",
    status: "pass",
    basis: "direct_response_header",
    conclusive: true,
    fixed: true,
  });
  assert.equal(buildRetestResult("csp_missing", { csp_missing: { status: "fail", basis: "direct_response_header" } }).fixed, false);
  assert.equal(buildRetestResult("mixed_content", { mixed_content: { status: "not_evaluated", basis: "html_body_unavailable" } }).conclusive, false);
});

test("selects the Cloudflare-safe transport without depending on one deployment variable", () => {
  assert.equal(scannerTransportForRuntime({ environment: { FIXFIRST_RUNTIME: "cloudflare" }, userAgent: "Node.js/24" }), "platform_fetch");
  assert.equal(scannerTransportForRuntime({ environment: {}, userAgent: "Cloudflare-Workers" }), "platform_fetch");
  assert.equal(scannerTransportForRuntime({ environment: {}, userAgent: "Node.js/24" }), "pinned_socket");
});

test("connects a successful API response to analysis and targeted retest", async () => {
  let requestedUrl = "";
  let requestedTransport = "";
  const handler = createScanHandler({
    rateLimit: () => ({ allowed: true, remaining: 5, retryAfter: 0 }),
    transportForRuntime: () => "pinned_socket",
    fetchPage: async (url, options) => {
      requestedUrl = url.toString();
      requestedTransport = options.transport;
      return {
        url: "https://public.example.net/",
        status: 200,
        headers: {
          "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "same-origin",
          "permissions-policy": "camera=()",
          "content-type": "text/html",
        },
        body: "<html><body>Public fixture</body></html>",
        bodyAnalyzed: true,
        contentType: "text/html",
        tls: { protocol: "TLSv1.3", authorized: true, validTo: new Date(Date.now() + 90 * 86_400_000).toUTCString() },
        redirects: 0,
        transport: "pinned_socket",
      };
    },
  });

  const response = await handler(apiRequest(JSON.stringify({
    url: "https://public.example.net/private/path?secret=value",
    authorized: true,
    retestCode: "hsts_missing",
  }), { origin: "https://fixfirst.local" }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(requestedUrl, "https://public.example.net/");
  assert.equal(requestedTransport, "pinned_socket");
  assert.equal(payload.result.findings.some(({ code }) => code === "hsts_missing"), true);
  assert.deepEqual(payload.result.retest, {
    code: "hsts_missing",
    status: "fail",
    basis: "direct_response_header",
    conclusive: true,
    fixed: false,
  });
  assert.equal(payload.result.authorizationRecord.analysisType, "passive_retest");
  assert.equal(payload.result.authorizationRecord.confirmationProvided, true);
  assert.equal(response.headers.get("x-ratelimit-remaining"), "5");
});

test("returns rate-limit metadata after six requests from one client", async () => {
  resetRateLimitForTests();
  const headers = { "x-real-ip": "203.0.113.99" };
  for (let index = 0; index < 6; index += 1) {
    const response = await POST(apiRequest("{}", { headers }));
    assert.equal(response.status, 403);
  }
  const blocked = await POST(apiRequest("{}", { headers }));
  assert.equal(blocked.status, 429);
  assert.equal(await responseCode(blocked), "RATE_LIMITED");
  assert.equal(Number(blocked.headers.get("retry-after")) > 0, true);
});
