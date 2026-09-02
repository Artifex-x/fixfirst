# Security controls

Last reviewed: 2026-09-02

[Português](SECURITY-CONTROLS.md) | **English**

This document distinguishes implemented controls from controls that still depend on a deployment platform or owner decision.

## Application controls

| Control | Implementation | Validation |
| --- | --- | --- |
| Server-side URL validation | HTTP and HTTPS only, no credentials, ports 80 and 443 only, maximum input length 2,048 characters | Unit tests for protocols, credentials, ports, local names, and invalid input |
| Private network blocking | IPv4 and IPv6 loopback, private, link-local, metadata, documentation, multicast, reserved, translation, and mapped ranges are rejected | Address tests include direct, mapped, compatible, and NAT64 forms |
| DNS scope control | Every returned A and AAAA record must be public before a target is accepted | Resolver tests and injected transport fixtures |
| Redirect control | Three redirects maximum; each destination repeats full URL and DNS validation | Private redirect integration test |
| DNS pinning on Node.js | The socket connects to the selected validated IP while Host and SNI retain the public hostname | Local TCP fixture verifies the requested Host and path |
| Global deadline | DNS, connection, redirects, headers, and body share one 12-second deadline | Hanging server integration test |
| Response limits | 64 KiB of headers and 512 KiB of analyzed HTML; chunked bodies are decoded within the limit | Oversized header and chunked body tests |
| Content scope | Only HTML and XHTML with identity content encoding are inspected | JSON response integration test |
| Scan request policy | JSON only, 8 KiB maximum, explicit authorization, same-origin browser check | API tests for content type, origin, malformed JSON, size, and authorization |
| Scan rate limiting | Six scans per ten minutes per hashed client key; map capped at 10,000 entries | Unit and API tests |
| Error handling | Stable public codes, no stack traces, no resolved address output | Route behavior tests and response review |
| Response policy | `no-store`, HSTS, same-origin resource policy, no-referrer, `nosniff`, and JSON CSP with `default-src 'none'` | API header assertions and runtime smoke tests |
| Site headers | HSTS, CSP, frame denial, `nosniff`, Referrer-Policy, Permissions-Policy, COOP, CORP, and DNS prefetch disabled through a shared policy | Automated header test plus production smoke tests in Next.js and vinext |
| Secret handling | No required administrative secret; `.env`, private keys, credential JSON, and local outputs ignored | Current tree and relevant history review before public export |
| Analytics privacy | Explicit events, closed allowlists, anonymous UUIDs, no target or scan content, no person profile, GPC and DNT honored | Automated payload, client, and route tests |
| Analytics route policy | Same-origin only, 4 KiB request limit, separate local rate limit, fixed PostHog hosts, short timeout | Route and delivery tests |

## Evidence controls

Every supported check receives a ledger status. The analyzer uses `pass`, `fail`, `not_applicable`, `not_observed`, `not_evaluated`, or `partial`. A check cannot silently become a pass when its required evidence is missing.

Confidence is determined by evidence source. It is separate from potential severity. Contextual CORS evidence requires manual review and presents validation before correction. Finding IDs and priority values are deterministic.

Retest uses the same finding code in a new complete scan. Only `pass` confirms the correction. Every other unavailable or partial state remains inconclusive.

## Repository controls prepared locally

| Control | Prepared state | External step still required |
| --- | --- | --- |
| CI | Lint, tests, npm audit, vinext build, and Next.js build | Create the repository and confirm the first run |
| Action supply chain | Official Actions pinned to full commit SHAs | Review Dependabot Action update pull requests |
| Token permissions | CI uses read-only contents permission; CodeQL adds packages read and security events write only | Confirm repository default workflow permissions |
| Dependency updates | Weekly npm and GitHub Actions Dependabot configuration | Enable dependency graph and security updates |
| Code scanning | JavaScript CodeQL workflow with security-and-quality queries | Confirm first upload succeeds |
| Main protection | Proportional ruleset documented | Create the ruleset in GitHub settings |
| Secret protection | File review, relevant history review, and ignore rules prepared | Enable secret scanning and push protection if available |

## Residual controls before a public scanner

The scanner rate limiter is not shared across serverless instances. Public release needs a platform-level or durable distributed limit for `/api/scan`. A separate local analytics limit also cannot prevent all distributed metric spam.

The CSP permits inline scripts and styles for compatibility with the current Next.js and vinext output. `object-src`, frames, base URLs, forms, and browser connections remain restricted. Removing inline allowances requires a tested nonce or hash strategy and remains a documented hardening item.

Cloudflare native fetch cannot bind the prevalidated DNS answer to the request. The private preview therefore depends partly on platform network isolation. A standard Node.js deployment uses pinned socket transport and must be tested in that platform before release.

Production analytics also requires the owner to confirm PostHog IP discard, retention, deletion, dashboard access, and a zero billing limit before events are enabled.
