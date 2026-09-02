import { createHash } from "node:crypto";
import { checkAnalyticsRateLimit } from "../../../lib/analytics/rate-limit.js";
import { validateAnalyticsEnvelope } from "../../../lib/analytics/events.js";
import { deliverPostHogEvent, readPostHogConfig } from "../../../lib/analytics/server.js";
import { SITE_SECURITY_HEADERS } from "../../../lib/security-headers.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

const API_HEADERS = {
  ...Object.fromEntries(SITE_SECURITY_HEADERS.map(({ key, value }) => [key, value])),
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  Vary: "Origin, Sec-Fetch-Site",
  "X-Content-Type-Options": "nosniff",
};

function emptyResponse(status = 204, retryAfter = 0) {
  return new Response(null, {
    status,
    headers: {
      ...API_HEADERS,
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
}

function errorResponse(code, status, retryAfter = 0) {
  return Response.json({ ok: false, error: code }, {
    status,
    headers: {
      ...API_HEADERS,
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
}

function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || forwarded || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
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

async function readSmallJson(request, maxBytes = 4 * 1024) {
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

export function createAnalyticsHandler(dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const rateLimit = dependencies.rateLimit ?? checkAnalyticsRateLimit;
  const deliver = dependencies.deliver ?? deliverPostHogEvent;
  const config = readPostHogConfig(environment);

  return async function analyticsHandler(request) {
    if (!isSameOriginRequest(request)) return errorResponse("CROSS_ORIGIN_REQUEST", 403);
    if (!config) return emptyResponse();

    const rate = rateLimit(clientKey(request));
    if (!rate.allowed) return errorResponse("RATE_LIMITED", 429, rate.retryAfter);

    const contentType = request.headers.get("content-type") || "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return errorResponse("UNSUPPORTED_MEDIA_TYPE", 415);

    let payload;
    try {
      payload = await readSmallJson(request);
    } catch (error) {
      if (error?.code === "PAYLOAD_TOO_LARGE") return errorResponse("PAYLOAD_TOO_LARGE", 413);
      return errorResponse("INVALID_REQUEST", 400);
    }

    const validated = validateAnalyticsEnvelope(payload);
    if (!validated.ok) return errorResponse(validated.error, 400);

    const delivered = await deliver(validated.value, config);
    return delivered ? emptyResponse() : errorResponse("ANALYTICS_UNAVAILABLE", 502);
  };
}

export const POST = createAnalyticsHandler();
