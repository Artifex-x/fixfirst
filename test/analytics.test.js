import test from "node:test";
import assert from "node:assert/strict";
import { createAnalyticsHandler } from "../app/api/analytics/route.js";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_FINDING_CODES,
  countBand,
  validateAnalyticsEnvelope,
} from "../lib/analytics/events.js";
import {
  createAnalyticsEnvelope,
  resetAnalyticsClientForTests,
} from "../lib/analytics/client.js";
import {
  buildPostHogCapturePayload,
  deliverPostHogEvent,
  readPostHogConfig,
} from "../lib/analytics/server.js";
import { SUPPORTED_FINDING_CODES } from "../lib/scanner/analyze.js";

const VISITOR_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const NEXT_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_TOKEN = `phc_${"a".repeat(32)}`;

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function randomSource(ids) {
  return { randomUUID: () => ids.shift() };
}

function validEnvelope(overrides = {}) {
  return {
    event: ANALYTICS_EVENTS.SCAN_COMPLETED,
    anonymous_id: VISITOR_ID,
    session_id: SESSION_ID,
    properties: {
      locale: "pt-BR",
      device_type: "desktop",
      scan_type: "initial",
      finding_count_band: "2_3",
      important_count_band: "1",
      transport: "platform_fetch",
    },
    ...overrides,
  };
}

test("keeps analytics finding codes aligned with the real scanner", () => {
  assert.deepEqual([...ANALYTICS_FINDING_CODES].sort(), [...SUPPORTED_FINDING_CODES].sort());
  assert.equal(countBand(0), "0");
  assert.equal(countBand(3), "2_3");
  assert.equal(countBand(20), "8_plus");
});

test("creates anonymous visitor and rolling session identifiers without URLs or form data", () => {
  resetAnalyticsClientForTests();
  const storage = memoryStorage();
  const ids = [VISITOR_ID, SESSION_ID, NEXT_SESSION_ID];
  const dependencies = {
    storage,
    randomSource: randomSource(ids),
    navigatorValue: {},
    viewportWidth: 390,
    now: 1_000,
  };

  const first = createAnalyticsEnvelope(ANALYTICS_EVENTS.PAGE_VIEW, { locale: "pt-BR" }, dependencies);
  const second = createAnalyticsEnvelope(ANALYTICS_EVENTS.PAGE_VIEW, { locale: "pt-BR" }, { ...dependencies, now: 2_000 });
  const later = createAnalyticsEnvelope(ANALYTICS_EVENTS.PAGE_VIEW, { locale: "pt-BR" }, { ...dependencies, now: 31 * 60 * 1000 });

  assert.equal(first.anonymous_id, VISITOR_ID);
  assert.equal(first.session_id, SESSION_ID);
  assert.deepEqual(first.properties, { locale: "pt-BR", device_type: "mobile", visitor_status: "new" });
  assert.equal(second.anonymous_id, VISITOR_ID);
  assert.equal(second.session_id, SESSION_ID);
  assert.equal(second.properties.visitor_status, "returning");
  assert.equal(later.session_id, NEXT_SESSION_ID);
  assert.equal(JSON.stringify([first, second, later]).includes("http"), false);
});

test("honors Global Privacy Control and Do Not Track before creating identifiers", () => {
  resetAnalyticsClientForTests();
  const storage = memoryStorage();
  const envelope = createAnalyticsEnvelope(ANALYTICS_EVENTS.PAGE_VIEW, { locale: "pt-BR" }, {
    storage,
    randomSource: randomSource([VISITOR_ID, SESSION_ID]),
    navigatorValue: { globalPrivacyControl: true },
    viewportWidth: 1200,
    now: 1_000,
  });

  assert.equal(envelope, null);
  assert.equal(storage.getItem("fixfirst.analytics.visitor.v1"), null);
});

test("rejects unknown analytics fields and invalid identifiers", () => {
  assert.equal(validateAnalyticsEnvelope(validEnvelope()).ok, true);
  assert.deepEqual(validateAnalyticsEnvelope(validEnvelope({ domain: "private.example" })), { ok: false, error: "INVALID_ENVELOPE" });
  assert.deepEqual(validateAnalyticsEnvelope(validEnvelope({ anonymous_id: "visitor@example.com" })), { ok: false, error: "INVALID_IDENTIFIER" });
  assert.deepEqual(validateAnalyticsEnvelope(validEnvelope({
    properties: { ...validEnvelope().properties, full_url: "https://example.com/?token=secret" },
  })), { ok: false, error: "UNSUPPORTED_PROPERTY" });
});

test("builds an anonymous PostHog payload with only allowlisted product properties", () => {
  const config = readPostHogConfig({
    POSTHOG_PROJECT_TOKEN: PROJECT_TOKEN,
    POSTHOG_HOST: "https://eu.i.posthog.com/",
  });
  const payload = buildPostHogCapturePayload(validEnvelope(), config, "2026-09-02T12:00:00.000Z");

  assert.equal(config.host, "https://eu.i.posthog.com");
  assert.equal(payload.api_key, PROJECT_TOKEN);
  assert.equal(payload.distinct_id, VISITOR_ID);
  assert.equal(payload.properties.$session_id, SESSION_ID);
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.$geoip_disable, true);
  assert.equal(payload.properties.analytics_schema_version, "1.0.0");
  assert.equal(payload.timestamp, "2026-09-02T12:00:00.000Z");
  assert.equal(JSON.stringify(payload).includes("private.example"), false);
  assert.equal(readPostHogConfig({ POSTHOG_PROJECT_TOKEN: PROJECT_TOKEN, POSTHOG_HOST: "https://example.com" }), null);
});

test("sends the documented PostHog capture request without credentials", async () => {
  let request;
  const config = readPostHogConfig({
    POSTHOG_PROJECT_TOKEN: PROJECT_TOKEN,
    POSTHOG_HOST: "https://us.i.posthog.com",
  });
  const sent = await deliverPostHogEvent(validEnvelope(), config, {
    timestamp: "2026-09-02T12:00:00.000Z",
    fetcher: async (url, options) => {
      request = { url, options };
      return { ok: true };
    },
  });

  assert.equal(sent, true);
  assert.equal(request.url, "https://us.i.posthog.com/i/v0/e/");
  assert.equal(request.options.credentials, "omit");
  assert.equal(JSON.parse(request.options.body).event, ANALYTICS_EVENTS.SCAN_COMPLETED);
});

test("analytics route is disabled without configuration and validates enabled requests", async () => {
  let delivered = null;
  const disabled = createAnalyticsHandler({
    environment: {},
    deliver: async () => {
      throw new Error("must not run");
    },
  });
  const disabledResponse = await disabled(new Request("https://fixfirst.example/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://fixfirst.example" },
    body: JSON.stringify(validEnvelope()),
  }));
  assert.equal(disabledResponse.status, 204);

  const enabled = createAnalyticsHandler({
    environment: { POSTHOG_PROJECT_TOKEN: PROJECT_TOKEN, POSTHOG_HOST: "https://us.i.posthog.com" },
    rateLimit: () => ({ allowed: true, retryAfter: 0 }),
    deliver: async (event, config) => {
      delivered = { event, config };
      return true;
    },
  });
  const enabledResponse = await enabled(new Request("https://fixfirst.example/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://fixfirst.example" },
    body: JSON.stringify(validEnvelope()),
  }));
  assert.equal(enabledResponse.status, 204);
  assert.deepEqual(delivered.event, validEnvelope());
  assert.equal(delivered.config.projectToken, PROJECT_TOKEN);

  const rejected = await enabled(new Request("https://fixfirst.example/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://fixfirst.example" },
    body: JSON.stringify(validEnvelope({ properties: { ...validEnvelope().properties, query_string: "secret" } })),
  }));
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error, "UNSUPPORTED_PROPERTY");
});

test("analytics route rejects cross-origin delivery before forwarding", async () => {
  const handler = createAnalyticsHandler({
    environment: { POSTHOG_PROJECT_TOKEN: PROJECT_TOKEN, POSTHOG_HOST: "https://us.i.posthog.com" },
    deliver: async () => true,
  });
  const response = await handler(new Request("https://fixfirst.example/api/analytics", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
      "Sec-Fetch-Site": "cross-site",
    },
    body: JSON.stringify(validEnvelope()),
  }));

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "CROSS_ORIGIN_REQUEST");
});
