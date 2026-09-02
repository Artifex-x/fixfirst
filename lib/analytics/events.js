export const ANALYTICS_SCHEMA_VERSION = "1.0.0";

export const ANALYTICS_EVENTS = Object.freeze({
  PAGE_VIEW: "page_view",
  SCAN_URL_SUBMITTED: "scan_url_submitted",
  SCAN_AUTHORIZED: "scan_authorized",
  SCAN_STARTED: "scan_started",
  SCAN_COMPLETED: "scan_completed",
  SCAN_FAILED: "scan_failed",
  RESULT_VIEWED: "result_viewed",
  PRIORITY_VIEWED: "priority_viewed",
  SIMPLE_GUIDE_OPENED: "simple_guide_opened",
  TECHNICAL_PLAYBOOK_OPENED: "technical_playbook_opened",
  DEVELOPER_MESSAGE_GENERATED: "developer_message_generated",
  REPORT_GENERATED: "report_generated",
  RETEST_STARTED: "retest_started",
  RETEST_COMPLETED: "retest_completed",
  FIX_CONFIRMED: "fix_confirmed",
  LANGUAGE_CHANGED: "language_changed",
});

export const ANALYTICS_FINDING_CODES = Object.freeze([
  "https_missing",
  "certificate_invalid",
  "certificate_expired",
  "certificate_expiring",
  "hsts_missing",
  "csp_missing",
  "frame_protection_missing",
  "nosniff_missing",
  "referrer_policy_missing",
  "permissions_policy_missing",
  "cookie_secure_missing",
  "cookie_httponly_missing",
  "cookie_samesite_missing",
  "cors_wildcard",
  "mixed_content",
  "server_disclosure",
]);

const COMMON_FIELDS = Object.freeze({
  locale: ["pt-BR", "en", "es"],
  device_type: ["desktop", "tablet", "mobile"],
});

function fields(extra = {}) {
  return Object.freeze({ ...COMMON_FIELDS, ...extra });
}

function definition(required, extra = {}) {
  return Object.freeze({
    fields: fields(extra),
    required: Object.freeze(["locale", "device_type", ...required]),
  });
}

export const ANALYTICS_EVENT_DEFINITIONS = Object.freeze({
  [ANALYTICS_EVENTS.PAGE_VIEW]: definition(["visitor_status"], {
    visitor_status: ["new", "returning"],
  }),
  [ANALYTICS_EVENTS.SCAN_URL_SUBMITTED]: definition([]),
  [ANALYTICS_EVENTS.SCAN_AUTHORIZED]: definition([]),
  [ANALYTICS_EVENTS.SCAN_STARTED]: definition(["scan_type"], {
    scan_type: ["initial", "retest"],
  }),
  [ANALYTICS_EVENTS.SCAN_COMPLETED]: definition(["scan_type", "finding_count_band", "important_count_band", "transport"], {
    scan_type: ["initial", "retest"],
    finding_count_band: ["0", "1", "2_3", "4_7", "8_plus"],
    important_count_band: ["0", "1", "2_3", "4_7", "8_plus"],
    transport: ["pinned_socket", "platform_fetch", "unknown"],
  }),
  [ANALYTICS_EVENTS.SCAN_FAILED]: definition(["scan_type", "error_category"], {
    scan_type: ["initial", "retest"],
    error_category: ["blocked", "timeout", "rate_limited", "unavailable", "unexpected"],
  }),
  [ANALYTICS_EVENTS.RESULT_VIEWED]: definition(["scan_type", "finding_count_band", "important_count_band"], {
    scan_type: ["initial", "retest"],
    finding_count_band: ["0", "1", "2_3", "4_7", "8_plus"],
    important_count_band: ["0", "1", "2_3", "4_7", "8_plus"],
  }),
  [ANALYTICS_EVENTS.PRIORITY_VIEWED]: definition(["finding_code", "priority", "confidence_status"], {
    finding_code: ANALYTICS_FINDING_CODES,
    priority: ["high", "medium", "low"],
    confidence_status: ["confirmed", "highConfidence", "likely", "review"],
  }),
  [ANALYTICS_EVENTS.SIMPLE_GUIDE_OPENED]: definition(["finding_code", "priority", "confidence_status"], {
    finding_code: ANALYTICS_FINDING_CODES,
    priority: ["high", "medium", "low"],
    confidence_status: ["confirmed", "highConfidence", "likely", "review"],
  }),
  [ANALYTICS_EVENTS.TECHNICAL_PLAYBOOK_OPENED]: definition(["finding_code", "playbook_variant"], {
    finding_code: ANALYTICS_FINDING_CODES,
    playbook_variant: ["generic", "technology_specific"],
  }),
  [ANALYTICS_EVENTS.DEVELOPER_MESSAGE_GENERATED]: definition(["finding_code"], {
    finding_code: ANALYTICS_FINDING_CODES,
  }),
  [ANALYTICS_EVENTS.REPORT_GENERATED]: definition(["report_type", "report_locale"], {
    report_type: ["simple", "technical"],
    report_locale: ["pt-BR", "en", "es"],
  }),
  [ANALYTICS_EVENTS.RETEST_STARTED]: definition(["finding_code"], {
    finding_code: ANALYTICS_FINDING_CODES,
  }),
  [ANALYTICS_EVENTS.RETEST_COMPLETED]: definition(["finding_code", "retest_outcome", "conclusive"], {
    finding_code: ANALYTICS_FINDING_CODES,
    retest_outcome: ["fixed", "pending", "inconclusive"],
    conclusive: "boolean",
  }),
  [ANALYTICS_EVENTS.FIX_CONFIRMED]: definition(["finding_code"], {
    finding_code: ANALYTICS_FINDING_CODES,
  }),
  [ANALYTICS_EVENTS.LANGUAGE_CHANGED]: definition(["previous_locale", "next_locale"], {
    previous_locale: ["pt-BR", "en", "es"],
    next_locale: ["pt-BR", "en", "es"],
  }),
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVELOPE_KEYS = new Set(["event", "anonymous_id", "session_id", "properties"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validField(rule, value) {
  if (rule === "boolean") return typeof value === "boolean";
  return typeof value === "string" && rule.includes(value);
}

export function isAnalyticsIdentifier(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateAnalyticsEnvelope(input) {
  if (!isPlainObject(input) || Object.keys(input).some((key) => !ENVELOPE_KEYS.has(key))) {
    return { ok: false, error: "INVALID_ENVELOPE" };
  }

  const definitionForEvent = ANALYTICS_EVENT_DEFINITIONS[input.event];
  if (!definitionForEvent) return { ok: false, error: "UNSUPPORTED_EVENT" };
  if (!isAnalyticsIdentifier(input.anonymous_id) || !isAnalyticsIdentifier(input.session_id)) {
    return { ok: false, error: "INVALID_IDENTIFIER" };
  }
  if (!isPlainObject(input.properties)) return { ok: false, error: "INVALID_PROPERTIES" };

  const propertyKeys = Object.keys(input.properties);
  if (propertyKeys.some((key) => !Object.hasOwn(definitionForEvent.fields, key))) {
    return { ok: false, error: "UNSUPPORTED_PROPERTY" };
  }
  if (definitionForEvent.required.some((key) => !Object.hasOwn(input.properties, key))) {
    return { ok: false, error: "MISSING_PROPERTY" };
  }

  const cleanProperties = {};
  for (const key of propertyKeys) {
    const value = input.properties[key];
    if (!validField(definitionForEvent.fields[key], value)) {
      return { ok: false, error: "INVALID_PROPERTY_VALUE" };
    }
    cleanProperties[key] = value;
  }

  return {
    ok: true,
    value: {
      event: input.event,
      anonymous_id: input.anonymous_id,
      session_id: input.session_id,
      properties: cleanProperties,
    },
  };
}

export function countBand(value) {
  const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (count === 0) return "0";
  if (count === 1) return "1";
  if (count <= 3) return "2_3";
  if (count <= 7) return "4_7";
  return "8_plus";
}
