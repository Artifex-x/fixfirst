# Scanner methodology

Last reviewed: 2026-09-02

[Português](SCANNER-METHODOLOGY.md) | **English**

## Scope

FixFirst analyzes the root response of one public HTTP or HTTPS origin. The scanner does not crawl, authenticate, execute browser JavaScript, submit forms, or attempt exploitation. The result describes evidence observed in that response at that time.

## Supported findings

| Finding code | Evidence source | Important qualification |
| --- | --- | --- |
| `https_missing` | Final transport scheme | Direct observation |
| `certificate_invalid` | TLS authorization result | Evaluated only when TLS metadata is available; expiration is reported separately |
| `certificate_expired` | Certificate `validTo` date | Direct date comparison |
| `certificate_expiring` | Certificate `validTo` within 21 days | Preventive finding, not an invalid certificate |
| `hsts_missing` | `Strict-Transport-Security` on HTTPS | Applies only to the analyzed HTTPS response |
| `csp_missing` | `Content-Security-Policy` | Presence check; policy strength is not fully evaluated |
| `frame_protection_missing` | CSP `frame-ancestors` or valid `X-Frame-Options` | Either valid mechanism passes |
| `nosniff_missing` | Exact `X-Content-Type-Options: nosniff` | Missing and invalid values fail |
| `referrer_policy_missing` | Recognized Referrer-Policy token | Presence and recognized value only |
| `permissions_policy_missing` | Non-empty Permissions-Policy | Policy completeness requires context |
| `cookie_secure_missing` | First 20 `Set-Cookie` values | Severity rises when a session-like cookie lacks Secure |
| `cookie_httponly_missing` | Session-like cookie names in the first 20 values | Other cookies are not automatically required to use HttpOnly |
| `cookie_samesite_missing` | First 20 `Set-Cookie` values | Checks for an explicit SameSite attribute |
| `cors_wildcard` | `Access-Control-Allow-Origin: *` | Contextual result at 55% confidence; public data may legitimately use it |
| `mixed_content` | Direct `http://` value in HTML `src`, `href`, or `action` | Evaluated only for bounded HTML or XHTML on an HTTPS page |
| `server_disclosure` | Server or X-Powered-By header presence | Informational; raw values are not returned as finding evidence |

## Check ledger

The API returns a status for every supported finding code.

| Status | Meaning |
| --- | --- |
| `pass` | The required evidence was available and the condition was not identified |
| `fail` | The condition was identified from the available evidence |
| `not_applicable` | The check does not apply to this response, such as HSTS on HTTP |
| `not_observed` | No relevant object was observed, such as no `Set-Cookie` header |
| `not_evaluated` | Required evidence was unavailable, such as TLS metadata in a platform fetch |
| `partial` | Only a documented subset was evaluated, such as a limited cookie set |

This ledger prevents missing data from being presented as a successful check.

## Confidence

Confidence describes the quality and directness of evidence. It does not describe impact and is not the probability that a site will be attacked.

| Evidence profile | Confidence | Interface status |
| --- | ---: | --- |
| Direct transport observation | 100 | Confirmed |
| Direct TLS observation | 100 | Confirmed |
| Direct response header | 99 | Confirmed |
| Direct cookie attribute | 92 | High confidence |
| Direct HTML reference | 87 | High confidence |
| General content or header heuristic | 70 | Likely |
| Header whose impact depends on business context | 55 | Needs manual review |

A finding below 65% enters a validation-first route. The Playbook presents validation before correction steps.

## Fix Priority

Priority is deterministic and separate from the passive indicator.

```text
priority = clamp(
  severity base
  + evidence adjustment
  + ease adjustment
  + context adjustment
  + chain adjustment,
  0,
  100
)
```

Severity bases are 90 for critical, 72 for high, 50 for medium, 28 for low, and 10 for informational. The evidence adjustment is `round((confidence - 50) × 0.16)`. A documented easy correction adds 6. Login, payment, or personal data form context adds 7 to findings where that context is relevant.

Two combinations add 6 to each participating finding: missing CSP with mixed content, and a cookie missing both Secure and HttpOnly protections. These combinations do not create new findings.

Scores of 78 or more are high priority. Scores from 48 through 77 are medium priority. Lower scores are low priority. Sorting uses priority first and severity as the deterministic tiebreaker.

The interface exposes the component values so a reviewer can understand the recommendation.

## Passive indicator

The value from 0 to 100 is a relative indicator for supported passive checks only. It is not a percentage of security.

Each finding begins with a severity deduction: 25 for critical, 16 for high, 8 for medium, 3 for low, and 0 for informational. That value is weighted by evidence confidence:

```text
finding deduction = round(severity deduction × confidence / 100)
indicator = max(0, 100 - sum(finding deductions))
```

The result includes the model version, formula, and severity table. Contextual evidence receives less weight and cannot affect the indicator as strongly as a direct observation of the same severity.

## Technology evidence

Technology names come from a small set of public response signals. Platform request headers can reach 99% confidence, server or powered-by tokens 95%, and HTML markers 82% through 88%. At most four signals are returned.

Technology evidence selects a specific Next.js, Nginx, or Apache example only at 80% confidence or higher. Other cases receive the generic Playbook. Detection is never used as proof that a vulnerability exists.

## Retest

Retest sends a new authorized request through the same URL validation, transport limits, and analyzer. The API then reads the ledger entry for the requested finding code.

| New status | Retest outcome |
| --- | --- |
| `pass` | Conclusive and fixed |
| `fail` | Conclusive and still identified |
| Any other status | Inconclusive; the previous issue is not marked fixed |

The result records discovery time in browser history, the new analysis time, and whether the check conclusively passed. The browser never changes status from a timer or button click alone.

## False positive controls

FixFirst avoids inferring body findings when the response is not analyzed HTML, avoids treating an absent cookie header as secure cookies, treats certificate metadata gaps as unevaluated, validates recognized header values where practical, and marks wildcard CORS impact as contextual. The scanner returns only bounded evidence summaries and does not claim whole-site coverage.

## Playbook references

Playbooks primarily use [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/), [MDN Web Docs](https://developer.mozilla.org/), [Next.js documentation](https://nextjs.org/docs), [Nginx documentation](https://nginx.org/en/docs/), and [Apache HTTP Server documentation](https://httpd.apache.org/docs/). Each Playbook returns the exact source links used for its recommendation.
