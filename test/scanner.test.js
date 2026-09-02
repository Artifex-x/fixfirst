import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PlaybookReferences from "../components/PlaybookReferences.js";
import { getSafeExternalReferences } from "../lib/external-references.js";
import { dictionaries, issueCopy, translate } from "../lib/i18n.js";
import { getPlaybook, playbookCodes } from "../lib/playbooks.js";
import { analyzeResponse, SUPPORTED_FINDING_CODES } from "../lib/scanner/analyze.js";
import { checkRateLimit, resetRateLimitForTests } from "../lib/scanner/rate-limit.js";
import { isUnsafeAddress, normalizeUrlInput, resolveSafeTarget, ScanTargetError, validateRedirectUrl } from "../lib/scanner/validate-url.js";

test("blocks private, loopback, metadata, and local addresses", () => {
  for (const address of [
    "0.0.0.0", "127.0.0.1", "10.1.2.3", "100.64.0.1", "172.16.0.10", "192.168.1.2", "169.254.169.254",
    "192.0.2.1", "198.18.0.1", "198.51.100.2", "203.0.113.5", "224.0.0.1", "255.255.255.255",
    "::1", "fc00::1", "fe80::1", "ff02::1", "100::1", "2001:db8::1", "2002:7f00:1::", "3fff::1",
    "::ffff:192.168.1.1", "::192.168.1.1", "64:ff9b::c0a8:101", "64:ff9b:1::1",
  ]) {
    assert.equal(isUnsafeAddress(address), true, address);
  }
  assert.equal(isUnsafeAddress("1.1.1.1"), false);
  assert.equal(isUnsafeAddress("2606:4700:4700::1111"), false);
});

test("normalizes public URLs and rejects unsafe protocols and ports", () => {
  assert.equal(normalizeUrlInput("example.org/path?token=secret#part").toString(), "https://example.org/");
  assert.throws(() => normalizeUrlInput("file:///etc/passwd"), ScanTargetError);
  assert.throws(() => normalizeUrlInput("http://localhost"), ScanTargetError);
  assert.throws(() => normalizeUrlInput("https://user:secret@example.org"), ScanTargetError);
  assert.throws(() => normalizeUrlInput("https://service.internal"), ScanTargetError);
  assert.throws(() => normalizeUrlInput("https://example.org:8080"), ScanTargetError);
});

test("validates every redirect URL without discarding its path", () => {
  assert.equal(validateRedirectUrl(new URL("https://example.org/path?q=1#part")).toString(), "https://example.org/path?q=1");
  assert.throws(() => validateRedirectUrl(new URL("http://127.0.0.1/admin")), ScanTargetError);
  assert.throws(() => validateRedirectUrl(new URL("https://user:secret@example.org/")), ScanTargetError);
  assert.throws(() => validateRedirectUrl(new URL("https://example.org:8443/")), ScanTargetError);
  assert.throws(() => validateRedirectUrl(new URL("file:///etc/passwd")), ScanTargetError);
});

test("accepts a public literal IP without performing DNS and rejects private literals", async () => {
  const target = await resolveSafeTarget("https://1.1.1.1");
  assert.equal(target.address, "1.1.1.1");
  assert.equal(target.family, 4);
  await assert.rejects(() => resolveSafeTarget("http://169.254.169.254"), ScanTargetError);
});

test("analyzes defensive headers and orders the most important finding first", () => {
  const result = analyzeResponse({
    url: "https://shop.example.net/",
    status: 200,
    headers: {
      server: "nginx/1.24",
      "set-cookie": ["session_id=abc; Path=/; SameSite=Lax"],
      "content-type": "text/html",
    },
    body: "<html><form><input type='password'><script src='http://cdn.example.net/app.js'></script></form></html>",
    tls: { protocol: "TLSv1.3", validTo: new Date(Date.now() + 90 * 86_400_000).toUTCString() },
    redirects: 0,
  });

  const codes = new Set(result.findings.map(({ code }) => code));
  assert.equal(result.domain, "shop.example.net");
  assert.equal(codes.has("hsts_missing"), true);
  assert.equal(codes.has("cookie_secure_missing"), true);
  assert.equal(codes.has("mixed_content"), true);
  assert.equal(result.findings[0].priorityScore >= result.findings[1].priorityScore, true);
  assert.equal(result.technologies.includes("Nginx"), true);
  assert.equal(result.score < 100, true);
});

test("returns a clear result when the passive protections are present", () => {
  const result = analyzeResponse({
    url: "https://secure.example.net/",
    status: 200,
    headers: {
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "content-type": "text/html",
    },
    body: "<html><body><h1>Secure</h1></body></html>",
    tls: { protocol: "TLSv1.3", validTo: new Date(Date.now() + 90 * 86_400_000).toUTCString() },
    redirects: 0,
  });

  assert.equal(result.findings.length, 0);
  assert.equal(result.importantCount, 0);
  assert.equal(result.score, 100);
});

test("detects certificate urgency and platform headers", () => {
  const result = analyzeResponse({
    url: "https://edge.example.net/",
    status: 200,
    headers: {
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "strict-transport-security": "max-age=31536000",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      "permissions-policy": "camera=()",
      "cf-ray": "example",
    },
    body: "<html></html>",
    tls: { protocol: "TLSv1.3", validTo: new Date(Date.now() - 2 * 86_400_000).toUTCString() },
    redirects: 0,
  });

  assert.equal(result.findings[0].code, "certificate_expired");
  assert.equal(result.findings[0].severity, "critical");
  assert.equal(result.technologies.includes("Cloudflare"), true);
});

test("does not count an expired certificate twice", () => {
  const result = analyzeResponse({
    url: "https://expired.example.net/",
    status: 200,
    headers: {},
    body: "",
    bodyAnalyzed: false,
    tls: {
      protocol: "TLSv1.3",
      authorized: false,
      authorizationError: "CERT_HAS_EXPIRED",
      validTo: new Date(Date.now() - 86_400_000).toUTCString(),
    },
  });

  assert.equal(result.findings.some(({ code }) => code === "certificate_invalid"), false);
  assert.equal(result.findings.some(({ code }) => code === "certificate_expired"), true);
  assert.deepEqual(result.checks.certificate_invalid, { status: "not_applicable", basis: "reported_as_certificate_expired" });
});

test("reports direct TLS validation errors and marks unavailable evidence honestly", () => {
  const invalid = analyzeResponse({
    url: "https://invalid.example.net/",
    status: 200,
    headers: {},
    body: "<script src='http://cdn.example.net/app.js'></script>",
    bodyAnalyzed: false,
    tls: { protocol: "TLSv1.3", authorized: false, authorizationError: "ERR_TLS_CERT_ALTNAME_INVALID" },
    transport: "pinned_socket",
  });
  const certificate = invalid.findings.find(({ code }) => code === "certificate_invalid");
  assert.equal(certificate.confidence, 100);
  assert.equal(certificate.confidenceBasis, "direct_tls_observation");
  assert.equal(invalid.checks.mixed_content.status, "not_evaluated");
  assert.equal(invalid.findings.some(({ code }) => code === "mixed_content"), false);
  assert.equal(invalid.responseMeta.transport, "pinned_socket");

  const unavailable = analyzeResponse({
    url: "https://edge.example.net/",
    status: 200,
    headers: {},
    body: "",
    bodyAnalyzed: false,
    tls: null,
    transport: "platform_fetch",
  });
  assert.equal(unavailable.checks.certificate_invalid.status, "not_evaluated");
  assert.equal(unavailable.coverage.includes("tls_certificate"), false);
});

test("keeps findings, priority factors, and the passive indicator deterministic", () => {
  const response = {
    url: "https://deterministic.example.net/",
    status: 200,
    headers: { "content-type": "text/html" },
    body: "<html><form><input name='email'><script src='http://cdn.example.net/app.js'></script></form></html>",
    bodyAnalyzed: true,
    tls: null,
    transport: "platform_fetch",
  };
  const first = analyzeResponse(response);
  const second = analyzeResponse(response);
  assert.equal(first.scoreModel.version, "passive-v2");
  assert.equal(first.score, second.score);
  assert.deepEqual(first.findings, second.findings);
  assert.equal(new Set(first.findings.map(({ id }) => id)).size, first.findings.length);
  for (const item of first.findings) {
    assert.equal(item.id, item.code);
    assert.equal(typeof item.priorityFactors.severity, "number");
    assert.equal(typeof item.priorityFactors.evidence, "number");
    assert.equal(typeof item.confidenceBasis, "string");
  }
});

test("treats a wildcard CORS header as contextual evidence", () => {
  const result = analyzeResponse({
    url: "https://api.example.net/",
    status: 200,
    headers: {
      "access-control-allow-origin": "*",
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "strict-transport-security": "max-age=31536000",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      "permissions-policy": "camera=()",
    },
    body: "",
    bodyAnalyzed: false,
    tls: null,
  });
  const cors = result.findings.find(({ code }) => code === "cors_wildcard");
  assert.equal(cors.confidence, 55);
  assert.equal(cors.confidenceStatus, "review");
  assert.equal(cors.indicatorDeduction, 4);
  assert.equal(result.scoreModel.formula.includes("evidence_confidence"), true);
});

test("rate limits the seventh request in a window", () => {
  resetRateLimitForTests();
  for (let index = 0; index < 6; index += 1) {
    assert.equal(checkRateLimit("test-client").allowed, true);
  }
  const blocked = checkRateLimit("test-client");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfter > 0, true);
  resetRateLimitForTests();
});

test("keeps UI dictionaries complete for every supported locale", () => {
  assert.equal(JSON.stringify(dictionaries).includes("—"), false);
  const issueCodes = Object.keys(dictionaries["pt-BR"].issues).sort();
  for (const locale of ["pt-BR", "en", "es"]) {
    assert.deepEqual(Object.keys(dictionaries[locale].issues).sort(), issueCodes);
    assert.equal(typeof translate(locale, "scan.progress"), "string");
    assert.equal(typeof translate(locale, "result.reviewNext"), "string");
    assert.equal(typeof translate(locale, "route.reviewFirst"), "string");
    assert.equal(typeof translate(locale, "checkStatuses.not_evaluated"), "string");
    assert.equal(translate(locale, "result.found", { count: 3 }).includes("3"), true);
    for (const code of issueCodes) {
      const copy = issueCopy(locale, code);
      for (const field of ["title", "found", "why", "impact", "owner", "fix", "reason"]) {
        assert.equal(typeof copy[field], "string", `${locale}.${code}.${field}`);
        assert.notEqual(copy[field].length, 0, `${locale}.${code}.${field}`);
      }
    }
  }
});

test("provides a structured remediation playbook for every supported finding", () => {
  assert.deepEqual([...playbookCodes].sort(), [...SUPPORTED_FINDING_CODES].sort());
  for (const locale of ["pt-BR", "en", "es"]) {
    for (const code of SUPPORTED_FINDING_CODES) {
      const playbook = getPlaybook(code, locale, [{ name: "Next.js", confidence: 95 }]);
      assert.ok(playbook, `${locale}.${code}`);
      assert.equal(playbook.finding, code);
      assert.equal(playbook.technology, "Next.js");
      assert.equal(playbook.version, "1.0.0");
      assert.equal(playbook.locale, locale);
      assert.match(playbook.lastReviewedAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.deepEqual(playbook.retest, { method: "same_passive_check", finding: code });
      for (const section of ["prerequisites", "steps", "validation", "rollback", "sources"]) {
        assert.equal(playbook[section].length > 0, true, `${locale}.${code}.${section}`);
      }
      assert.equal(getSafeExternalReferences(playbook.sources).length, playbook.sources.length);
      assert.equal(playbook.sources.every(({ label, url }) => /^(OWASP|MDN|Next\.js|Nginx|Apache): /.test(label) && /^https:\/\//.test(url)), true);
    }
  }
});

test("keeps only descriptive, unique, HTTPS playbook references", () => {
  const valid = { label: "MDN: Content Security Policy (CSP)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP" };
  const references = getSafeExternalReferences([
    valid,
    valid,
    { label: "https://example.com/reference", url: "https://example.com/reference" },
    { label: "Unsafe", url: "javascript:alert(1)" },
    { label: "Insecure", url: "http://example.com/reference" },
    { label: "Missing URL" },
  ]);

  assert.deepEqual(references, [valid]);
  assert.equal(translate("pt-BR", "route.sources"), "Referências do Playbook");
  assert.equal(translate("en", "route.sources"), "Playbook references");
  assert.equal(translate("es", "route.sources"), "Referencias del Playbook");

  const markup = renderToStaticMarkup(createElement(PlaybookReferences, { sources: [valid], locale: "pt-BR" }));
  assert.match(markup, /<h3>Referências do Playbook<\/h3>/);
  assert.match(markup, /MDN: Content Security Policy \(CSP\)/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(markup, /abre em uma nova aba/);
});
