# FixFirst Threat Model

Last reviewed: 2026-09-02

[Português](THREAT_MODEL.md) | **English**

## Scope

This model covers the browser application, `POST /api/scan`, `POST /api/analytics`, URL validation, outbound scanner requests, response analysis, local history, anonymous analytics identifiers, remediation output, and repository workflows. It reflects the current implementation and does not assume a database or user account system.

## Assets

| Asset | Security objective |
| --- | --- |
| Outbound network capability | Prevent access to private, local, reserved, or unintended services |
| Scanner availability | Limit expensive requests, large responses, and repeated abuse |
| Result integrity | Keep findings, confidence, priority, and Retest status tied to observed evidence |
| Analytics privacy | Measure product use without target URLs, scan content, credentials, or personal profiles |
| Analytics integrity and quota | Limit fabricated events and avoid unnecessary consumption of the free allowance |
| Deployment environment | Prevent secrets, internal metadata, and platform credentials from being exposed |
| Browser storage | Keep scan history and anonymous identifiers on the user's device and under browser control |
| Development workflow | Prevent unreviewed code and overprivileged automation from changing `main` |

## Entry points and trust boundaries

The scanner entry point is a user-controlled URL in an 8 KiB JSON request. Additional untrusted inputs arrive through DNS answers, redirects, response status lines, headers, cookies, and HTML bodies. The analytics entry point accepts a 4 KiB JSON envelope with a closed event schema. Dependency packages and pull request code are separate software supply chain entry points.

The first trust boundary is between the browser and the APIs. The second is between the scan API and the public target network. A third separates the analytics route from PostHog ingestion. Another boundary exists between repository content and GitHub Actions. Browser `localStorage` is outside the server trust boundary and may be read by other code on the same origin if a future client-side injection flaw exists.

## Threats, mitigations, and residual risk

| STRIDE area | Threat | Implemented mitigation | Residual risk |
| --- | --- | --- | --- |
| Spoofing | A user claims authorization for a domain they do not control | Explicit authorization confirmation and passive-only behavior | Ownership cannot be verified without an external challenge |
| Tampering | Redirect or DNS behavior changes the destination after validation | Every hop is validated; all DNS answers are checked; Node transport connects to the selected IP | Cloudflare platform fetch cannot pin the validated DNS answer |
| Repudiation | A user disputes starting a scan | The result contains an authorization confirmation time and analysis type | There is no durable audit log or user identity |
| Information disclosure | SSRF reaches localhost, metadata, private networks, or embedded credentials | Protocol and port allowlists, hostname blocks, IPv4 and IPv6 range checks, credential rejection, redirect revalidation | Provider egress isolation remains part of the Cloudflare control |
| Information disclosure | Sensitive URL query data appears in output or logs | User input is reduced to the site root; returned URLs remove query strings and fragments; runtime code does not intentionally log targets | A target can place sensitive text in public headers or HTML; evidence avoids copying raw values where possible |
| Information disclosure | Analytics captures a target, form value, scan evidence, or browser identity | Explicit events, closed fields and values, no URL or referrer, `credentials: omit`, no person profile, GPC and DNT support | Anonymous UUIDs are still pseudonymous identifiers stored in the event stream |
| Denial of service | Slow targets, redirect loops, large headers, or large bodies consume resources | One 12-second deadline, three redirects, 64 KiB header limit, 512 KiB HTML limit, 8 KiB request limit, socket cleanup | A distributed attacker can bypass the per-instance rate limiter |
| Denial of service | Many clients fill a rate-limit map | Maps are capped at 10,000 and expired entries are pruned | Limits reset when an instance restarts and are not shared across instances |
| Tampering | Fabricated analytics events distort metrics or consume quota | Same-origin checks, 4 KiB limit, closed event schema, fixed PostHog hosts, and a separate local rate limit | Automated distributed traffic can still generate valid-looking events |
| Elevation of privilege | A malicious pull request obtains write access or deployment secrets | CI has read-only contents permission, no deployment secrets, no `pull_request_target`, immutable action SHAs, and an active ruleset | A compromised administrative bypass can still circumvent the normal review flow |
| Tampering | A vulnerable dependency changes scanner behavior | Locked dependencies, npm audit, Dependabot configuration, CodeQL, and CI builds | Advisory coverage is incomplete and updates still require review |
| Information disclosure | A secret is committed or exposed to the client | No required administrative secret, ignored `.env` and key patterns, sanitized public history, secret scanning, and push protection | Automated detection cannot cover every possible secret format |
| Tampering | A contextual result is presented as confirmed | Confidence is evidence based; wildcard CORS requires manual review; Retest can be inconclusive | Passive evidence cannot establish business context by itself |

## Residual risks requiring a deployment decision

1. Production combines a per-instance limit with Vercel automatic DDoS mitigation. Because no billed distributed rate limiting was authorized, a distributed attacker can still bypass the local quota.
2. Cloudflare native fetch depends on platform egress isolation because the validated DNS answer cannot be bound to the connection.
3. The scanner intentionally accepts an invalid TLS connection in pinned transport so it can observe and report the certificate failure. Such a result must not be treated as trusted content.
4. An authorization checkbox cannot prove ownership. Strong verification would require DNS, file, or account-based challenges and is outside this MVP.
5. Passive checks cover one response. Route-specific behavior and authenticated content remain unknown.
6. Anonymous analytics depends on a third-party event store. The dashboard is private and IP discard is enabled, while retention, deletion, and administrative access still depend on the owner account.
7. Privacy signals and content blockers intentionally create analytics undercounting.

These are documented residual risks, not hidden assumptions.
