import { ANALYTICS_SCHEMA_VERSION } from "./events.js";

const POSTHOG_CLOUD_HOSTS = new Set([
  "https://us.i.posthog.com",
  "https://eu.i.posthog.com",
]);

function normalizedHost(value) {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

export function readPostHogConfig(environment = process.env) {
  const projectToken = typeof environment?.POSTHOG_PROJECT_TOKEN === "string"
    ? environment.POSTHOG_PROJECT_TOKEN.trim()
    : "";
  const host = normalizedHost(environment?.POSTHOG_HOST);

  if (!/^phc_[A-Za-z0-9_-]{20,500}$/.test(projectToken) || !POSTHOG_CLOUD_HOSTS.has(host)) {
    return null;
  }

  return { projectToken, host };
}

export function buildPostHogCapturePayload(envelope, config, timestamp = new Date().toISOString()) {
  return {
    api_key: config.projectToken,
    distinct_id: envelope.anonymous_id,
    event: envelope.event,
    properties: {
      ...envelope.properties,
      $session_id: envelope.session_id,
      $process_person_profile: false,
      $geoip_disable: true,
      analytics_schema_version: ANALYTICS_SCHEMA_VERSION,
      event_source: "fixfirst_web",
    },
    timestamp,
  };
}

export async function deliverPostHogEvent(envelope, config, options = {}) {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!config || typeof fetcher !== "function") return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 2500);
  try {
    const response = await fetcher(`${config.host}/i/v0/e/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPostHogCapturePayload(envelope, config, options.timestamp)),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
