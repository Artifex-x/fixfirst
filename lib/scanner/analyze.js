const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const SCORE_DEDUCTION = { critical: 25, high: 16, medium: 8, low: 3, info: 0 };
const SEVERITY_PRIORITY_BASE = { critical: 90, high: 72, medium: 50, low: 28, info: 10 };

const EVIDENCE_PROFILES = Object.freeze({
  direct_transport: { score: 100, basis: "direct_transport_observation" },
  direct_tls: { score: 100, basis: "direct_tls_observation" },
  direct_header: { score: 99, basis: "direct_response_header" },
  direct_cookie: { score: 92, basis: "direct_cookie_attribute" },
  direct_html: { score: 87, basis: "direct_html_reference" },
  contextual_header: { score: 55, basis: "header_requires_context_review" },
  heuristic: { score: 70, basis: "content_or_header_heuristic" },
});

export const SUPPORTED_FINDING_CODES = Object.freeze([
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

function headerValue(headers, name) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : value || "";
}

function confidenceStatus(score) {
  if (score >= 95) return "confirmed";
  if (score >= 80) return "highConfidence";
  if (score >= 65) return "likely";
  return "review";
}

function finding(code, severity, evidenceProfile, evidence, technical = {}, modifiers = {}) {
  const profile = EVIDENCE_PROFILES[evidenceProfile] || EVIDENCE_PROFILES.heuristic;
  const evidenceAdjustment = Math.round((profile.score - 50) * 0.16);
  const easeAdjustment = modifiers.easyFix ? 6 : 0;
  const contextAdjustment = modifiers.contextBoost || 0;
  const priorityScore = Math.max(0, Math.min(100, SEVERITY_PRIORITY_BASE[severity] + evidenceAdjustment + easeAdjustment + contextAdjustment));

  return {
    id: code,
    code,
    severity,
    confidence: profile.score,
    confidenceBasis: profile.basis,
    confidenceStatus: confidenceStatus(profile.score),
    priorityScore,
    priority: priorityScore >= 78 ? "high" : priorityScore >= 48 ? "medium" : "low",
    priorityFactors: {
      severity: SEVERITY_PRIORITY_BASE[severity],
      evidence: evidenceAdjustment,
      ease: easeAdjustment,
      context: contextAdjustment,
      chain: 0,
    },
    evidence,
    technical,
  };
}

function detectTechnology(headers, body, bodyAnalyzed) {
  const candidates = [];
  const add = (name, confidence, basis) => {
    const current = candidates.find((item) => item.name === name);
    if (!current || confidence > current.confidence) {
      if (current) Object.assign(current, { confidence, basis });
      else candidates.push({ name, confidence, basis });
    }
  };

  const server = headerValue(headers, "server").toLowerCase();
  const poweredBy = headerValue(headers, "x-powered-by").toLowerCase();
  if (headerValue(headers, "cf-ray") || server.includes("cloudflare")) add("Cloudflare", 99, "response_header");
  if (headerValue(headers, "x-vercel-id")) add("Vercel", 99, "response_header");
  if (headerValue(headers, "x-nf-request-id")) add("Netlify", 99, "response_header");
  if (server.includes("nginx")) add("Nginx", 95, "server_header");
  if (server.includes("apache")) add("Apache", 95, "server_header");
  if (/next(?:\.js)?/i.test(poweredBy)) add("Next.js", 95, "powered_by_header");

  if (bodyAnalyzed) {
    const sample = body.slice(0, 200_000);
    const generator = sample.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1] || "";
    const source = `${generator} ${sample}`.toLowerCase();
    if (/wordpress|wp-content|wp-includes/.test(source)) add("WordPress", 88, "html_marker");
    if (/woocommerce/.test(source)) add("WooCommerce", 86, "html_marker");
    if (/cdn\.shopify|shopify/.test(source)) add("Shopify", 82, "html_marker");
    if (/__next|next\.js/.test(source)) add("Next.js", 82, "html_marker");
  }

  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

function initializeChecks() {
  return Object.fromEntries(SUPPORTED_FINDING_CODES.map((code) => [code, { status: "not_evaluated", basis: "not_evaluated" }]));
}

function setCheck(checks, code, status, basis) {
  checks[code] = { status, basis };
}

export function analyzeResponse(response) {
  const { headers, body = "", tls, url, status, bodyAnalyzed = true } = response;
  const parsed = new URL(url);
  const isHttps = parsed.protocol === "https:";
  const checks = initializeChecks();
  const technologyEvidence = detectTechnology(headers, body, bodyAnalyzed);
  const technologies = technologyEvidence.map(({ name }) => name);
  const context = {
    login: bodyAnalyzed && /<input[^>]+type=["']password["']/i.test(body),
    payments: bodyAnalyzed && /stripe|paypal|checkout|pagamento|payment|shopify/i.test(body),
    personalData: bodyAnalyzed && /<form\b/i.test(body) && /email|phone|telefone|address|endereço|document|cpf/i.test(body),
  };
  const contextBoost = context.login || context.payments || context.personalData ? 7 : 0;
  const findings = [];
  const addFinding = (...args) => {
    const item = finding(...args);
    findings.push(item);
    setCheck(checks, item.code, "fail", item.confidenceBasis);
    return item;
  };

  if (!isHttps) {
    addFinding("https_missing", "high", "direct_transport", `Final URL uses ${parsed.protocol}`, { type: "Transport security", endpoint: url, cwe: "CWE-319", cvss: "7.4" }, { easyFix: true, contextBoost });
    for (const code of ["certificate_invalid", "certificate_expired", "certificate_expiring", "hsts_missing"]) setCheck(checks, code, "not_applicable", "https_not_in_use");
  } else {
    setCheck(checks, "https_missing", "pass", "direct_transport_observation");
    if (tls && (tls.validTo || tls.authorizationError || typeof tls.authorized === "boolean")) {
      const expiredAuthorization = tls.authorizationError === "CERT_HAS_EXPIRED";
      if (tls.authorized === false && !expiredAuthorization) {
        addFinding("certificate_invalid", "high", "direct_tls", `TLS validation failed: ${tls.authorizationError || "certificate_not_authorized"}`, { type: "TLS certificate", endpoint: url, cvss: "7.4" }, { contextBoost });
      } else if (expiredAuthorization) {
        setCheck(checks, "certificate_invalid", "not_applicable", "reported_as_certificate_expired");
      } else {
        setCheck(checks, "certificate_invalid", "pass", "direct_tls_observation");
      }

      if (tls.validTo) {
        const validTo = new Date(tls.validTo);
        const days = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);
        if (Number.isNaN(days)) {
          setCheck(checks, "certificate_expired", "not_evaluated", "invalid_certificate_date");
          setCheck(checks, "certificate_expiring", "not_evaluated", "invalid_certificate_date");
        } else if (days < 0) {
          addFinding("certificate_expired", "critical", "direct_tls", `Certificate expired ${Math.abs(days)} day(s) ago`, { type: "TLS certificate", endpoint: url, cvss: "9.1" }, { contextBoost });
          setCheck(checks, "certificate_expiring", "not_applicable", "certificate_already_expired");
        } else {
          setCheck(checks, "certificate_expired", "pass", "direct_tls_observation");
          if (days <= 21) addFinding("certificate_expiring", "medium", "direct_tls", `Certificate expires in ${days} day(s)`, { type: "TLS certificate", endpoint: url, cvss: "4.0" }, { easyFix: true });
          else setCheck(checks, "certificate_expiring", "pass", "direct_tls_observation");
        }
      } else {
        setCheck(checks, "certificate_expired", "not_evaluated", "certificate_dates_unavailable");
        setCheck(checks, "certificate_expiring", "not_evaluated", "certificate_dates_unavailable");
      }
    } else {
      for (const code of ["certificate_invalid", "certificate_expired", "certificate_expiring"]) setCheck(checks, code, "not_evaluated", "tls_metadata_unavailable");
    }
  }

  const csp = headerValue(headers, "content-security-policy");
  const hsts = headerValue(headers, "strict-transport-security");
  const frame = headerValue(headers, "x-frame-options");
  const nosniff = headerValue(headers, "x-content-type-options");
  const referrer = headerValue(headers, "referrer-policy");
  const permissions = headerValue(headers, "permissions-policy");
  const cors = headerValue(headers, "access-control-allow-origin");

  if (isHttps) {
    if (!hsts) addFinding("hsts_missing", "medium", "direct_header", "Header not present: Strict-Transport-Security", { type: "HTTP security header", header: "Strict-Transport-Security", cwe: "CWE-319", cvss: "5.3" }, { easyFix: true, contextBoost });
    else setCheck(checks, "hsts_missing", "pass", "direct_response_header");
  }

  if (!csp) addFinding("csp_missing", "medium", "direct_header", "Header not present: Content-Security-Policy", { type: "HTTP security header", header: "Content-Security-Policy", cwe: "CWE-693", cvss: "5.3" }, { contextBoost });
  else setCheck(checks, "csp_missing", "pass", "direct_response_header");

  const hasFrameAncestors = /(?:^|;)\s*frame-ancestors\s+[^;]+/i.test(csp);
  const validFrameHeader = /^(deny|sameorigin)$/i.test(frame.trim());
  if (!hasFrameAncestors && !validFrameHeader) addFinding("frame_protection_missing", context.login ? "high" : "medium", "direct_header", "No valid X-Frame-Options or CSP frame-ancestors directive", { type: "HTTP security header", header: "X-Frame-Options / CSP", cwe: "CWE-1021", cvss: context.login ? "6.5" : "4.3" }, { easyFix: true, contextBoost });
  else setCheck(checks, "frame_protection_missing", "pass", "direct_response_header");

  if (nosniff.trim().toLowerCase() !== "nosniff") addFinding("nosniff_missing", "low", "direct_header", "Header not present or invalid: X-Content-Type-Options", { type: "HTTP security header", header: "X-Content-Type-Options", cwe: "CWE-693", cvss: "3.7" }, { easyFix: true });
  else setCheck(checks, "nosniff_missing", "pass", "direct_response_header");

  const referrerPolicies = new Set(["no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "same-origin", "strict-origin", "strict-origin-when-cross-origin", "unsafe-url"]);
  if (!referrer || !referrer.split(",").some((value) => referrerPolicies.has(value.trim().toLowerCase()))) addFinding("referrer_policy_missing", "low", "direct_header", "Header not present or invalid: Referrer-Policy", { type: "Privacy header", header: "Referrer-Policy", cwe: "CWE-200", cvss: "3.1" }, { easyFix: true });
  else setCheck(checks, "referrer_policy_missing", "pass", "direct_response_header");

  if (!permissions.trim()) addFinding("permissions_policy_missing", "low", "direct_header", "Header not present: Permissions-Policy", { type: "Browser policy", header: "Permissions-Policy", cwe: "CWE-693", cvss: "2.6" }, { easyFix: true });
  else setCheck(checks, "permissions_policy_missing", "pass", "direct_response_header");

  if (cors.trim() === "*") addFinding("cors_wildcard", "medium", "contextual_header", "Access-Control-Allow-Origin: *", { type: "CORS configuration", header: "Access-Control-Allow-Origin", cwe: "CWE-942", cvss: "5.3" }, { contextBoost });
  else setCheck(checks, "cors_wildcard", "pass", "direct_response_header");

  const rawCookies = headers["set-cookie"];
  const cookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
  const selectedCookies = cookies.slice(0, 20);
  const cookieCoverageLimited = cookies.length > selectedCookies.length;
  const sessionPattern = /session|sess|auth|token|jwt|login|sid/i;
  const sessionCookies = selectedCookies.filter((cookie) => sessionPattern.test(cookie.split("=")[0]));

  if (!selectedCookies.length) {
    for (const code of ["cookie_secure_missing", "cookie_httponly_missing", "cookie_samesite_missing"]) setCheck(checks, code, "not_observed", "no_set_cookie_header");
  } else {
    if (!isHttps) {
      setCheck(checks, "cookie_secure_missing", "not_applicable", "https_not_in_use");
    } else if (selectedCookies.some((cookie) => !/;\s*secure(?:;|$)/i.test(cookie))) {
      const sensitive = sessionCookies.some((cookie) => !/;\s*secure(?:;|$)/i.test(cookie));
      addFinding("cookie_secure_missing", sensitive ? "high" : "medium", "direct_cookie", "Set-Cookie without Secure", { type: "Cookie attribute", header: "Set-Cookie", cwe: "CWE-614", cvss: sensitive ? "6.5" : "4.3" }, { easyFix: true, contextBoost });
    } else {
      setCheck(checks, "cookie_secure_missing", cookieCoverageLimited ? "partial" : "pass", cookieCoverageLimited ? "first_20_cookies_checked" : "direct_cookie_attribute");
    }

    if (!sessionCookies.length) {
      setCheck(checks, "cookie_httponly_missing", cookieCoverageLimited ? "partial" : "not_applicable", cookieCoverageLimited ? "first_20_cookies_checked" : "no_session_like_cookie_observed");
    } else if (sessionCookies.some((cookie) => !/;\s*httponly(?:;|$)/i.test(cookie))) {
      addFinding("cookie_httponly_missing", "medium", "direct_cookie", "Session-like cookie without HttpOnly", { type: "Cookie attribute", header: "Set-Cookie", cwe: "CWE-1004", cvss: "4.3" }, { easyFix: true, contextBoost });
    } else {
      setCheck(checks, "cookie_httponly_missing", cookieCoverageLimited ? "partial" : "pass", cookieCoverageLimited ? "first_20_cookies_checked" : "direct_cookie_attribute");
    }

    if (selectedCookies.some((cookie) => !/;\s*samesite\s*=/i.test(cookie))) {
      addFinding("cookie_samesite_missing", "medium", "direct_cookie", "Set-Cookie without explicit SameSite", { type: "Cookie attribute", header: "Set-Cookie", cwe: "CWE-1275", cvss: "4.3" }, { easyFix: true, contextBoost });
    } else {
      setCheck(checks, "cookie_samesite_missing", cookieCoverageLimited ? "partial" : "pass", cookieCoverageLimited ? "first_20_cookies_checked" : "direct_cookie_attribute");
    }
  }

  if (!isHttps) {
    setCheck(checks, "mixed_content", "not_applicable", "https_not_in_use");
  } else if (!bodyAnalyzed) {
    setCheck(checks, "mixed_content", "not_evaluated", "html_body_unavailable");
  } else if (/(?:src|href|action)\s*=\s*["']http:\/\//i.test(body)) {
    addFinding("mixed_content", "medium", "direct_html", "HTTP resource reference found in HTTPS document", { type: "Mixed content", endpoint: url, cwe: "CWE-319", cvss: "5.3" }, { contextBoost });
  } else {
    setCheck(checks, "mixed_content", "pass", "direct_html_reference");
  }

  const disclosure = [headerValue(headers, "server"), headerValue(headers, "x-powered-by")].filter(Boolean);
  if (disclosure.length) addFinding("server_disclosure", "info", "direct_header", "Server or X-Powered-By header present", { type: "Information disclosure", header: "Server / X-Powered-By", cwe: "CWE-200", cvss: "0.0" });
  else setCheck(checks, "server_disclosure", "pass", "direct_response_header");

  const codes = new Set(findings.map(({ code }) => code));
  const chains = [];
  if (codes.has("csp_missing") && codes.has("mixed_content")) chains.push({ codes: ["csp_missing", "mixed_content"], level: "medium", label: "browser_content_chain" });
  if (codes.has("cookie_secure_missing") && codes.has("cookie_httponly_missing")) chains.push({ codes: ["cookie_secure_missing", "cookie_httponly_missing"], level: "high", label: "session_cookie_chain" });

  for (const chain of chains) {
    for (const item of findings) {
      if (!chain.codes.includes(item.code)) continue;
      item.priorityFactors.chain += 6;
      item.priorityScore = Math.min(100, item.priorityScore + 6);
      item.priority = item.priorityScore >= 78 ? "high" : item.priorityScore >= 48 ? "medium" : "low";
    }
  }

  findings.sort((a, b) => b.priorityScore - a.priorityScore || SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
  for (const item of findings) {
    item.indicatorDeduction = Math.round(SCORE_DEDUCTION[item.severity] * (item.confidence / 100));
  }
  const score = Math.max(0, 100 - findings.reduce((total, item) => total + item.indicatorDeduction, 0));
  const importantCount = findings.filter(({ priority }) => priority === "high").length;
  const coverage = ["transport_scheme", "security_headers", "cookies", "cors", "technology_exposure"];
  if (tls && (tls.validTo || typeof tls.authorized === "boolean")) coverage.push("tls_certificate");
  if (bodyAnalyzed) coverage.push("html_content");

  return {
    domain: parsed.hostname,
    requestedUrl: response.requestedUrl || url,
    finalUrl: url,
    statusCode: status,
    analyzedAt: new Date().toISOString(),
    score,
    scoreModel: {
      version: "passive-v2",
      scope: "supported_passive_checks",
      maximum: 100,
      formula: "100 - sum(round(severity_deduction * evidence_confidence / 100))",
      severityDeductions: SCORE_DEDUCTION,
    },
    importantCount,
    findings,
    checks,
    technologies,
    technologyEvidence,
    context,
    chains,
    coverage,
    responseMeta: {
      redirects: response.redirects || 0,
      bodyTruncated: Boolean(response.truncated),
      bodyAnalyzed: Boolean(bodyAnalyzed),
      contentType: response.contentType || null,
      transport: response.transport || null,
      tlsProtocol: tls?.protocol || null,
      tlsAuthorized: typeof tls?.authorized === "boolean" ? tls.authorized : null,
      certificateValidTo: tls?.validTo || null,
      cookieCoverageLimited,
    },
  };
}
