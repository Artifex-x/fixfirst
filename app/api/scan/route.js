import { createHash } from "node:crypto";
import { SITE_SECURITY_HEADERS } from "../../../lib/security-headers.js";
import { analyzeResponse, SUPPORTED_FINDING_CODES } from "../../../lib/scanner/analyze.js";
import { fetchPublicPage } from "../../../lib/scanner/http-client.js";
import { checkRateLimit } from "../../../lib/scanner/rate-limit.js";
import { normalizeUrlInput, ScanTargetError } from "../../../lib/scanner/validate-url.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || forwarded || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

const API_HEADERS = {
  ...Object.fromEntries(SITE_SECURITY_HEADERS.map(({ key, value }) => [key, value])),
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  Vary: "Origin, Sec-Fetch-Site",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(code, status, retryAfter) {
  return Response.json({ ok: false, error: code }, {
    status,
    headers: {
      ...API_HEADERS,
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
}

function isSameOriginRequest(request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const allowedHosts = new Set([
      requestUrl.host,
      request.headers.get("host"),
      request.headers.get("x-forwarded-host"),
    ].filter(Boolean));
    const forwardedProtocol = request.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "");
    return allowedHosts.has(originUrl.host) && originUrl.protocol === `${forwardedProtocol}:`;
  } catch {
    return false;
  }
}

async function readSmallJson(request, maxBytes = 8 * 1024) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw Object.assign(new Error("Payload too large"), { code: "PAYLOAD_TOO_LARGE" });
  if (!request.body) return {};

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw Object.assign(new Error("Payload too large"), { code: "PAYLOAD_TOO_LARGE" });
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function buildRetestResult(code, checks) {
  const check = checks[code] || { status: "not_evaluated", basis: "check_unavailable" };
  return {
    code,
    status: check.status,
    basis: check.basis,
    conclusive: check.status === "pass" || check.status === "fail",
    fixed: check.status === "pass",
  };
}

export function scannerTransportForRuntime({ environment = process.env, userAgent = globalThis.navigator?.userAgent } = {}) {
  if (environment?.FIXFIRST_RUNTIME === "cloudflare") return "platform_fetch";
  if (userAgent === "Cloudflare-Workers") return "platform_fetch";
  return "pinned_socket";
}

export function createScanHandler(dependencies = {}) {
  const rateLimit = dependencies.rateLimit || checkRateLimit;
  const fetchPage = dependencies.fetchPage || fetchPublicPage;
  const analyze = dependencies.analyze || analyzeResponse;
  const transportForRuntime = dependencies.transportForRuntime || scannerTransportForRuntime;

  return async function scanHandler(request) {
    const rate = rateLimit(clientKey(request));
    if (!rate.allowed) return errorResponse("RATE_LIMITED", 429, rate.retryAfter);
    if (!isSameOriginRequest(request)) return errorResponse("CROSS_ORIGIN_REQUEST", 403);

    const contentType = request.headers.get("content-type") || "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return errorResponse("UNSUPPORTED_MEDIA_TYPE", 415);

    let payload;
    try {
      payload = await readSmallJson(request);
    } catch (error) {
      if (error?.code === "PAYLOAD_TOO_LARGE") return errorResponse("PAYLOAD_TOO_LARGE", 413);
      return errorResponse("INVALID_REQUEST", 400);
    }

    if (payload?.authorized !== true || typeof payload?.url !== "string") return errorResponse("AUTHORIZATION_REQUIRED", 403);
    if (payload.retestCode != null && !SUPPORTED_FINDING_CODES.includes(payload.retestCode)) return errorResponse("INVALID_REQUEST", 400);

    let normalized;
    try {
      normalized = normalizeUrlInput(payload.url);
    } catch (error) {
      const code = error instanceof ScanTargetError ? error.code : "INVALID_URL";
      return errorResponse(code, 400);
    }

    try {
      const response = await fetchPage(normalized, { transport: transportForRuntime() });
      const result = analyze({ ...response, requestedUrl: normalized.toString() });
      if (payload.retestCode) {
        result.retest = buildRetestResult(payload.retestCode, result.checks);
      }
      result.authorizationRecord = {
        domain: result.domain,
        confirmedAt: new Date().toISOString(),
        confirmationProvided: true,
        analysisType: payload.retestCode ? "passive_retest" : "passive_initial",
      };
      return Response.json({ ok: true, result }, { status: 200, headers: { ...API_HEADERS, "X-RateLimit-Limit": "6", "X-RateLimit-Remaining": String(rate.remaining) } });
    } catch (error) {
      const code = error instanceof ScanTargetError ? error.code : "SCAN_FAILED";
      const status = code === "SCAN_TIMEOUT" ? 504 : ["BLOCKED_TARGET", "INVALID_REDIRECT", "TOO_MANY_REDIRECTS"].includes(code) ? 400 : 502;
      return errorResponse(code, status);
    }
  };
}

export const POST = createScanHandler();
