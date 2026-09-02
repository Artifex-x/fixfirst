import { ANALYTICS_EVENTS, isAnalyticsIdentifier, validateAnalyticsEnvelope } from "./events.js";

const VISITOR_STORAGE_KEY = "fixfirst.analytics.visitor.v1";
const SESSION_STORAGE_KEY = "fixfirst.analytics.session.v1";
const SESSION_IDLE_MS = 30 * 60 * 1000;

let volatileVisitorId = null;
let volatileSession = null;
let deliveryQueue = Promise.resolve();

function randomUuid(randomSource = globalThis.crypto) {
  if (typeof randomSource?.randomUUID === "function") return randomSource.randomUUID();
  if (typeof randomSource?.getRandomValues !== "function") return null;

  const bytes = new Uint8Array(16);
  randomSource.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function readStorage(storage, key) {
  try {
    return storage?.getItem(key) || null;
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function resolveIdentity({ storage, now, randomSource }) {
  const storedVisitor = readStorage(storage, VISITOR_STORAGE_KEY);
  const hasStoredVisitor = isAnalyticsIdentifier(storedVisitor);
  const anonymousId = hasStoredVisitor ? storedVisitor : (volatileVisitorId || randomUuid(randomSource));
  if (!anonymousId) return null;
  volatileVisitorId = anonymousId;
  writeStorage(storage, VISITOR_STORAGE_KEY, anonymousId);

  let storedSession = null;
  try {
    storedSession = JSON.parse(readStorage(storage, SESSION_STORAGE_KEY) || "null");
  } catch {}

  const sessionIsCurrent = isAnalyticsIdentifier(storedSession?.id)
    && Number.isFinite(storedSession?.last_activity)
    && now - storedSession.last_activity >= 0
    && now - storedSession.last_activity < SESSION_IDLE_MS;
  const volatileIsCurrent = isAnalyticsIdentifier(volatileSession?.id)
    && now - volatileSession.last_activity >= 0
    && now - volatileSession.last_activity < SESSION_IDLE_MS;
  const sessionId = sessionIsCurrent
    ? storedSession.id
    : volatileIsCurrent
      ? volatileSession.id
      : randomUuid(randomSource);
  if (!sessionId) return null;

  volatileSession = { id: sessionId, last_activity: now };
  writeStorage(storage, SESSION_STORAGE_KEY, JSON.stringify(volatileSession));

  return {
    anonymousId,
    sessionId,
    visitorStatus: hasStoredVisitor ? "returning" : "new",
  };
}

export function deviceTypeForWidth(width) {
  if (!Number.isFinite(width) || width >= 1100) return "desktop";
  if (width >= 768) return "tablet";
  return "mobile";
}

export function privacySignalEnabled(navigatorValue = globalThis.navigator) {
  return navigatorValue?.globalPrivacyControl === true
    || ["1", "yes"].includes(navigatorValue?.doNotTrack)
    || ["1", "yes"].includes(globalThis.doNotTrack);
}

export function createAnalyticsEnvelope(event, properties = {}, dependencies = {}) {
  const navigatorValue = dependencies.navigatorValue ?? globalThis.navigator;
  if (privacySignalEnabled(navigatorValue)) return null;

  const storage = Object.hasOwn(dependencies, "storage") ? dependencies.storage : browserStorage();
  const now = dependencies.now ?? Date.now();
  const randomSource = dependencies.randomSource ?? globalThis.crypto;
  const viewportWidth = dependencies.viewportWidth ?? globalThis.innerWidth;
  const identity = resolveIdentity({ storage, now, randomSource });
  if (!identity) return null;
  const envelopeProperties = {
    ...properties,
    device_type: deviceTypeForWidth(viewportWidth),
    ...(event === ANALYTICS_EVENTS.PAGE_VIEW ? { visitor_status: identity.visitorStatus } : {}),
  };

  const validated = validateAnalyticsEnvelope({
    event,
    anonymous_id: identity.anonymousId,
    session_id: identity.sessionId,
    properties: envelopeProperties,
  });
  return validated.ok ? validated.value : null;
}

export async function sendAnalyticsEvent(event, properties = {}, dependencies = {}) {
  let envelope;
  try {
    envelope = createAnalyticsEnvelope(event, properties, dependencies);
  } catch {
    return false;
  }
  if (!envelope) return false;

  const fetcher = dependencies.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== "function") return false;

  try {
    const response = await fetcher("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      cache: "no-store",
      credentials: "omit",
      keepalive: true,
      mode: "same-origin",
      referrerPolicy: "no-referrer",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function captureAnalytics(event, properties = {}) {
  deliveryQueue = deliveryQueue.catch(() => false).then(() => sendAnalyticsEvent(event, properties));
}

export function resetAnalyticsClientForTests() {
  volatileVisitorId = null;
  volatileSession = null;
  deliveryQueue = Promise.resolve();
}
