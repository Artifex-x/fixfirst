# FixFirst analytics

Status: production active and initial validation complete

Last reviewed: September 2, 2026

[Português](ANALYTICS.md) | **English**

## Purpose

FixFirst analytics measures real product usage and the remediation flow. It separates a page visit from meaningful scanner use and supports analysis of completion, guide access, retesting, and confirmed fixes.

No number may be presented as a real metric until it comes from the public environment and includes the measured date range.

## Selected tool

The project uses PostHog Cloud Product Analytics. As of September 2, 2026, the [official Product Analytics documentation](https://posthog.com/docs/product-analytics/start-here) states that the first 1 million events each month are free and that no credit card is required to start. Funnels and retention analysis are part of the product.

No paid plan, auto converting trial, or usage billed feature may be enabled for FixFirst. The billing limit must remain at zero during this phase.

## Integration architecture

The browser records explicit events only and sends a small envelope to `POST /api/analytics` on the FixFirst origin. The route validates the event name, identifiers, and every property against closed allowlists. Only then does it send the event to the [official PostHog Capture API](https://posthog.com/docs/api/capture#single-event).

This architecture does not load the PostHog JavaScript SDK in the browser. Autocapture, automatic form capture, automatic pageviews, and Session Replay are therefore never started. The browser does not connect directly to PostHog.

PostHog defines the Capture API project token as public. FixFirst still keeps it in server configuration to avoid unnecessary exposure. Sending events requires no personal API key or administrative credential.

## Configuration

The integration uses two server environment variables:

| Variable | Purpose |
| --- | --- |
| `POSTHOG_PROJECT_TOKEN` | Project token for the PostHog project |
| `POSTHOG_HOST` | Regional PostHog Cloud ingestion host |

The code accepts only `https://us.i.posthog.com` and `https://eu.i.posthog.com`. Real values do not belong in GitHub, README files, or logs.

Without a valid configuration, the route returns without sending data to an external service. Vercel production has valid configuration, while the private preview continues without external delivery.

## Anonymous identity and sessions

FixFirst creates one random UUID for the visitor and another for the session. The visitor UUID is stored in browser `localStorage` so unique and returning use can be measured responsibly. A session UUID is renewed after 30 minutes without activity.

Events include `$process_person_profile: false`, so PostHog processes them anonymously without creating a person profile. The integration also includes `$geoip_disable: true` and never forwards the visitor IP to PostHog.

Global Privacy Control and Do Not Track are honored. When either signal is enabled, FixFirst does not create analytics identifiers or send events.

## Captured events

Every event corresponds to a real interface transition or a real scanner response.

| Event | Real trigger | Allowed event properties |
| --- | --- | --- |
| `page_view` | The application finishes loading | `visitor_status` |
| `scan_url_submitted` | A syntactically valid URL advances to authorization | None |
| `scan_authorized` | The visitor confirms authorization and starts the scan | None |
| `scan_started` | An initial scan request is sent | `scan_type` |
| `scan_completed` | The initial scan returns a valid result | `scan_type`, finding bands, priority band, transport |
| `scan_failed` | An initial scan or retest ends with an error | `scan_type`, stable error category |
| `result_viewed` | The result screen is displayed | `scan_type`, finding and priority bands |
| `priority_viewed` | The first priority is displayed | finding code, priority, confidence status |
| `simple_guide_opened` | The plain language finding guide is displayed | finding code, priority, confidence status |
| `technical_playbook_opened` | The technical remediation route is displayed | finding code, Playbook type |
| `developer_message_generated` | The developer message is generated and displayed | finding code |
| `report_generated` | A report preview is generated | report type and report language |
| `retest_started` | A real Retest request is sent | finding code |
| `retest_completed` | The Retest returns a valid evaluation | finding code, outcome, conclusive status |
| `fix_confirmed` | The same check conclusively passes during Retest | finding code |
| `language_changed` | The interface language changes | previous and next locale |

Every event includes only `locale` and a broad device category in addition to the listed properties. Device category uses the current viewport width only: mobile, tablet, or desktop. Exact dimensions, User Agent, and fingerprint data are not sent.

Finding counts use the bands `0`, `1`, `2_3`, `4_7`, and `8_plus`. This answers product questions without transmitting the technical result.

## Main funnel

The private funnel must use this order:

1. `page_view`
2. `scan_url_submitted`
3. `scan_authorized`
4. `scan_started`
5. `scan_completed`
6. `result_viewed`
7. `priority_viewed`
8. `simple_guide_opened` or `technical_playbook_opened`
9. `retest_started`
10. `retest_completed`
11. `fix_confirmed`

The error branch uses `scan_failed`. It must not count as a successful completion.

## Private dashboard

The private dashboard was created in the confirmed PostHog project and contains six validated insights:

1. Visits over the last 30 days.
2. Started, completed, and failed scans.
3. Plain guide and technical Playbook openings.
4. Started and completed Retests plus confirmed fixes.
5. The scan start to completion funnel with step drop off.
6. The journey from visit through completed scan, Playbook, Retest, and confirmed fix.

The dashboard is never rendered inside FixFirst, has no public sharing, and uses restricted access. Administrative access remains with the PostHog project owner account.

## Data deliberately excluded

| Category | Excluded data |
| --- | --- |
| Scanner target | Domain, URL, path, query string, fragment, redirect, resolved IP |
| Credentials | Password, token, private API key, cookie, authorization header, private key |
| Scan content | Raw headers, HTML, evidence, complete findings, certificate data, report body |
| Personal data | Name, email, phone, account, free form text |
| Browser | Full User Agent, exact screen dimensions, fingerprint |
| Navigation | Current URL, previous page, referrer |
| Internal state | Stack trace, environment variable, log, deployment secret |

The browser request uses `credentials: omit` and `referrerPolicy: no-referrer`. Cookies and the current page address are therefore not sent with the event request to the analytics route.

## Additional controls

1. The route accepts same origin requests only.
2. JSON bodies are limited to 4 KiB.
3. Events, fields, and values use closed allowlists.
4. External delivery uses a short timeout and never blocks the scanner flow.
5. The route has its own local volume limit, separate from the scanner limit.
6. The ingestion host uses an allowlist to prevent arbitrary destinations.
7. FixFirst does not send the project token to the browser.

The PostHog project has **Discard client IP data** enabled under **Settings**, **Project**, **IP data capture configuration**. The [data storage documentation](https://posthog.com/docs/privacy/data-storage) describes this control. The integration forwards only the server egress IP, never the visitor IP, and the discard setting must remain enabled.

## Derived metrics

The dashboard can calculate daily visitors, unique visitors, sessions, return usage, start rate, completion rate, priority views, guide views, Playbook views, report generation, Retest rate, and confirmed fix rate.

Any future public metric must use real data, state its date range, and explain relevant filters. Individual event data must never be published.

## Limitations

1. Clearing browser storage creates a new anonymous identifier.
2. Different browsers and devices appear as different visitors.
3. People using Global Privacy Control or Do Not Track do not appear in metrics.
4. Content blockers and network failures can prevent event delivery.
5. The route limit is local to one instance and does not replace distributed platform controls.
6. Device classification is broad and does not identify a model or operating system.
7. Retention and deletion remain administrative controls of the owner account and require periodic review.

## Validation

Automated tests cover anonymous identifiers, session renewal, privacy signals, unknown field rejection, exclusion of URLs and free form content, the anonymous PostHog payload, ingestion host allowlisting, and the unconfigured route behavior.

On September 2, 2026, the published route recognized the production configuration, rejected an invalid envelope with a stable error, and the dashboard received real `page_view` events. No synthetic event was created to populate metrics. Counts remain private until a representative period exists.

## Official references

1. [PostHog Product Analytics](https://posthog.com/docs/product-analytics/start-here)
2. [Capture API](https://posthog.com/docs/api/capture#single-event)
3. [Anonymous events](https://posthog.com/docs/data/anonymous-vs-identified-events#how-to-capture-anonymous-events)
4. [Sessions](https://posthog.com/docs/data/sessions)
5. [Data collection controls](https://posthog.com/docs/privacy/data-collection)
6. [Data storage controls](https://posthog.com/docs/privacy/data-storage)
