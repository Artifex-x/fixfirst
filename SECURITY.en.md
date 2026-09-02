# Security policy

[Português](SECURITY.md) | **English**

FixFirst is a defensive, passive website configuration checker. Security reports about the application itself are welcome, especially reports involving SSRF, scope bypass, unsafe redirects, denial of service, exposed secrets, or incorrect claims about scan evidence.

## Supported version

Only the current `main` branch is supported before the first tagged release. Older private preview versions may not contain the latest controls.

## Reporting a vulnerability

Use GitHub private vulnerability reporting after it is enabled for the public repository. Do not include exploit details, private URLs, credentials, personal data, or proof-of-concept payloads in a public issue.

If private vulnerability reporting is not available, create a public issue that contains only a request for a private contact channel. Wait for the repository owner to provide one through GitHub. Never send a password, token, API key, private key, or session cookie.

This is an individual learning project, so there is no guaranteed response SLA. A valid report will be reviewed before technical details are disclosed publicly.

## Useful report content

Include the affected version or commit, the security impact, the smallest safe reproduction, and any conditions required to trigger the behavior. Redact target domains and response data unless they are public test fixtures that you control.

## What FixFirst checks

FixFirst makes one bounded passive request to a public website root and evaluates the returned transport, selected response headers, visible cookie attributes, limited HTML references, CORS configuration, and public technology signals. A Retest repeats the request and reevaluates the selected check.

## What FixFirst does not check

FixFirst does not authenticate to the target, crawl the entire site, submit forms, execute exploit payloads, assess source code, test business logic, or prove that a site is secure. A result applies only to the public response and evidence observed at that time.

## Authorization and safe testing

Users must confirm that they are authorized to analyze the target. This confirmation is an explicit scope control, but FixFirst cannot independently verify ownership. Do not use the service against a website without permission.

Security research on FixFirst should avoid degrading availability or causing outbound traffic to third parties. Use local fixtures or infrastructure you control whenever possible.

## Data and secrets

The application has no user accounts, database, browser analytics SDK, or required administrative secret. Recent scan history stays in the browser's `localStorage`. Analytics uses a separate anonymous identifier, explicit allowlisted events, and a same-origin server relay that remains disabled without PostHog environment configuration. The server removes query strings from returned URLs and does not intentionally log target responses.

Any future secret must be stored as a server-side deployment variable. It must not appear in client code, commits, logs, reports, screenshots, or issue content.

## Disclosure

Allow time to understand and correct a confirmed problem before publishing technical details. Coordinated disclosure should describe the affected behavior, the fix, and any remaining limitation without exposing unrelated user data.
