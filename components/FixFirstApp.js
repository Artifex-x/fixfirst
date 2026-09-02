"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Icon from "./Icons";
import PlaybookReferences from "./PlaybookReferences";
import { captureAnalytics } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS, countBand } from "@/lib/analytics/events";
import { issueCopy, locales, translate } from "@/lib/i18n";
import { getPlaybook } from "@/lib/playbooks";

const STORAGE_LOCALE = "fixfirst.locale";
const STORAGE_HISTORY = "fixfirst.history.v1";

function displayDomain(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function clientNormalizeUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    if (!parsed.hostname || /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.)/i.test(parsed.hostname)) return null;
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function formatDate(iso, locale, includeTime = false) {
  const language = locale === "pt-BR" ? "pt-BR" : locale;
  try {
    return new Intl.DateTimeFormat(language, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function analyticsErrorCategory(code) {
  if (["INVALID_URL", "BLOCKED_TARGET", "INVALID_REDIRECT", "TOO_MANY_REDIRECTS"].includes(code)) return "blocked";
  if (code === "SCAN_TIMEOUT") return "timeout";
  if (code === "RATE_LIMITED") return "rate_limited";
  if (["DNS_FAILED", "FETCH_FAILED", "TLS_INVALID", "INVALID_RESPONSE", "UNSUPPORTED_RESPONSE", "RESPONSE_HEADERS_TOO_LARGE"].includes(code)) return "unavailable";
  return "unexpected";
}

function issueAnalyticsProperties(issue, locale) {
  return {
    locale,
    finding_code: issue.code,
    priority: issue.priority,
    confidence_status: issue.confidenceStatus,
  };
}

function resultAnalyticsProperties(result, locale, scanType) {
  return {
    locale,
    scan_type: scanType,
    finding_count_band: countBand(result.findings.length),
    important_count_band: countBand(result.importantCount),
  };
}

function Modal({ title, onClose, children, wide = false, printClass = "", closeLabel = "Close" }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [...(dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])].filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className={classNames("modal", wide && "modal-wide", printClass)} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head hide-on-print">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label={closeLabel}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function RiskBadge({ severity, locale, priority = false }) {
  const label = translate(locale, priority ? `levels.${severity}` : `severities.${severity}`);
  return <span className={`risk-badge risk-${severity}`}>{label}</span>;
}

function Score({ value, locale, compact = false }) {
  return (
    <div className={classNames("score", compact && "score-compact")} style={{ "--score": `${value * 3.6}deg` }}>
      <div className="score-ring"><strong>{value}</strong><span>/100</span></div>
      {!compact && <span className="score-label">{translate(locale, "result.protection")}</span>}
      {!compact && <small className="score-help">{translate(locale, "result.indicatorHelp")}</small>}
    </div>
  );
}

function ConfidenceLabel({ issue, locale }) {
  return <span>{translate(locale, `issue.${issue.confidenceStatus}`)}</span>;
}

function TechnicalDetails({ issue, result, locale }) {
  const basisLabel = translate(locale, `confidenceBases.${issue.confidenceBasis}`);
  const technologies = result.technologyEvidence?.map(({ name, confidence }) => `${name} (${confidence}%)`).join(", ");
  const factors = issue.priorityFactors
    ? Object.entries(issue.priorityFactors).map(([name, value]) => `${name}: ${value >= 0 ? "+" : ""}${value}`).join(" · ")
    : null;
  const rows = [
    [translate(locale, "issue.status"), translate(locale, `issue.${issue.confidenceStatus}`)],
    [translate(locale, "issue.confidenceBasis"), basisLabel],
    [translate(locale, "issue.evidence"), issue.evidence],
    [translate(locale, "issue.endpoint"), result.finalUrl],
    ["CWE", issue.technical?.cwe],
    ["CVSS", issue.technical?.cvss],
    ["Header", issue.technical?.header],
    [translate(locale, "issue.technology"), technologies],
    [translate(locale, "issue.priorityBreakdown"), factors],
  ].filter(([, value]) => value);

  return (
    <details className="technical-details">
      <summary>{translate(locale, "issue.technical")}<Icon name="chevronDown" size={17} /></summary>
      <dl>
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <p className="technical-note">{translate(locale, "issue.confidence")}: {issue.confidence}% · {translate(locale, "issue.fixPriority")}: {issue.priorityScore}/100</p>
    </details>
  );
}

function PlaybookPanel({ playbook, locale, validateFirst = false }) {
  if (!playbook) return null;
  const standardSections = [
    ["prerequisites", playbook.prerequisites],
    ["steps", playbook.steps],
    ["validation", playbook.validation],
    ["rollback", playbook.rollback],
  ];
  const sections = validateFirst
    ? [standardSections[0], standardSections[2], standardSections[1], standardSections[3]]
    : standardSections;

  return (
    <div className="playbook">
      {sections.map(([key, items]) => (
        <section className={`playbook-section playbook-${key}`} key={key}>
          <h3>{translate(locale, `route.${key}`)}</h3>
          {key === "steps" ? <ol>{items.map((item) => <li key={item}>{item}</li>)}</ol> : <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>}
        </section>
      ))}

      {playbook.examples.length > 0 && (
        <section className="playbook-section playbook-examples">
          <h3>{translate(locale, "route.examples")}</h3>
          <div className="example-list">{playbook.examples.map((example) => <div className="code-example" key={`${example.label}-${example.code}`}><strong>{example.label}</strong><pre><code>{example.code}</code></pre>{example.note && <p>{example.note}</p>}</div>)}</div>
        </section>
      )}

      <PlaybookReferences sources={playbook.sources} locale={locale} />
    </div>
  );
}

function RouteView({ issue, result, locale, onRetest, onDeveloper }) {
  const copy = issueCopy(locale, issue.code);
  const playbook = getPlaybook(issue.code, locale, result.technologyEvidence);
  const validateFirst = issue.confidenceStatus === "review";
  return (
    <section className="route-view">
      <div className="route-heading"><span className="eyebrow">{translate(locale, "route.eyebrow")}</span><h1>{translate(locale, "route.title")}</h1><p>{copy.title}</p></div>
      <ol className="route-steps">
        <li className="complete"><span><Icon name="check" size={16} /></span><div><small>{translate(locale, "route.problem")}</small><strong>{copy.title}</strong></div></li>
        <li className="active"><span>2</span><div><small>{translate(locale, "route.owner")}</small><strong>{copy.owner}</strong></div></li>
        <li><span>3</span><div><small>{translate(locale, "route.change")}</small><strong>{copy.fix}</strong></div></li>
        <li><span>4</span><div><small>{translate(locale, "route.retest")}</small><strong>{translate(locale, "route.testHint")}</strong></div></li>
      </ol>
      <article className="fix-instructions">
        <div className="fix-title"><span className="soft-icon"><Icon name="info" size={20} /></span><div><span>{translate(locale, "issue.how")}</span><h2>{copy.title}</h2></div></div>
        {validateFirst && <p className="review-first"><Icon name="info" size={18} />{translate(locale, "route.reviewFirst")}</p>}
        <p>{copy.fix}</p>
        {result.technologyEvidence?.length > 0 && <div className="tech-context"><span>{translate(locale, "issue.technology")}</span>{result.technologyEvidence.map((technology) => <strong key={technology.name}>{technology.name} · {technology.confidence}%</strong>)}</div>}
        <div className="fix-callout"><Icon name="info" size={19} /><p>{copy.reason}</p></div>
        <PlaybookPanel playbook={playbook} locale={locale} validateFirst={validateFirst} />
      </article>
      <div className="route-actions"><button type="button" className="button button-primary" onClick={onRetest}><Icon name="refresh" size={18} />{translate(locale, "route.retest")}</button><button type="button" className="button button-secondary" onClick={onDeveloper}><Icon name="copy" size={18} />{translate(locale, "route.send")}</button></div>
    </section>
  );
}

function IssueView({ issue, result, locale, onFix, showAll, onToggleAll, presentationMode }) {
  const copy = issueCopy(locale, issue.code);
  const others = result.findings.filter((item) => item.id !== issue.id);

  return (
    <div className="issue-layout">
      <article className="issue-card primary-issue">
        <div className="issue-card-head">
          <div>
            <span className="eyebrow">{translate(locale, "issue.priority", { level: translate(locale, `levels.${issue.priority}`) })}</span>
            <h1>{copy.title}</h1>
          </div>
          <div className="risk-pair">
            <div><span>{translate(locale, "issue.risk")}</span><RiskBadge severity={issue.severity} locale={locale} /></div>
            <div><span>{translate(locale, "issue.confidence")}</span><strong>{issue.confidence}%</strong><ConfidenceLabel issue={issue} locale={locale} /></div>
          </div>
        </div>

        <div className="plain-grid">
          <section><h2>{translate(locale, "issue.what")}</h2><p>{copy.found}</p></section>
          {!presentationMode && <section className="calm-answer"><h2>{translate(locale, "issue.hacked")}</h2><p>{translate(locale, "issue.hackedAnswer")}</p></section>}
          <section><h2>{translate(locale, "issue.why")}</h2><p>{copy.why}</p></section>
          <section><h2>{translate(locale, "issue.impact")}</h2><p>{copy.impact}</p></section>
        </div>

        <aside className="priority-reason">
          <Icon name="info" size={20} />
          <div><strong>{translate(locale, "issue.priorityReason")}</strong><p>{copy.reason}</p></div>
        </aside>

        <div className="owner-row">
          <div><span>{translate(locale, "issue.owner")}</span><strong>{copy.owner}</strong></div>
          <button type="button" className="button button-primary" onClick={onFix}>{translate(locale, issue.confidenceStatus === "review" ? "issue.validateFirst" : "issue.openRoute")}<Icon name="arrowRight" size={18} /></button>
        </div>

        {!presentationMode && <TechnicalDetails issue={issue} result={result} locale={locale} />}
      </article>

      {!presentationMode && others.length > 0 && (
        <section className="other-issues">
          <button type="button" className="text-button" onClick={onToggleAll} aria-expanded={showAll}>
            {showAll ? translate(locale, "issue.hideAll") : translate(locale, "issue.showAll", { count: result.findings.length })}
            <Icon name="chevronDown" size={17} className={showAll ? "rotate" : ""} />
          </button>
          {showAll && <div className="issue-list">{others.map((item) => {
            const itemCopy = issueCopy(locale, item.code);
            return <div className="issue-list-row" key={item.id}><div><strong>{itemCopy.title}</strong><span>{itemCopy.found}</span></div><div><RiskBadge severity={item.severity} locale={locale} /><span>{item.confidence}%</span></div></div>;
          })}</div>}
        </section>
      )}
    </div>
  );
}

function ReportDocument({ result, locale, type }) {
  const top = result.findings.slice(0, type === "technical" ? 8 : 3);
  const coverage = result.coverage?.map((item) => translate(locale, `coverageLabels.${item}`)).join(", ");
  return (
    <article className="report-document">
      <header className="report-brand"><Image src="/mark.svg" width={34} height={34} alt="" /><div><strong>FixFirst</strong><span>Website Security Advisor</span></div></header>
      <div className="report-title"><span>{translate(locale, "report.summary")}</span><h1>{result.domain}</h1><p>{translate(locale, "report.generated", { date: formatDate(new Date().toISOString(), locale, true) })}</p></div>
      <div className="report-summary-grid"><div><Score value={result.score} locale={locale} compact /><span className="report-score-label">{translate(locale, "result.protection")}</span></div><div><strong>{result.findings.length}</strong><span>{translate(locale, "result.found", { count: result.findings.length })}</span></div><div><strong>{result.importantCount}</strong><span>{result.importantCount > 0 ? translate(locale, "result.first", { count: result.importantCount }) : translate(locale, "result.reviewNext")}</span></div></div>
      <section className="report-section"><h2>{translate(locale, "report.priorities")}</h2>{top.length ? top.map((item, index) => {
        const copy = issueCopy(locale, item.code);
        const playbook = getPlaybook(item.code, locale, result.technologyEvidence);
        return <div className="report-issue" key={item.id}><div className="report-issue-title"><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{copy.title}</h3><RiskBadge severity={item.severity} locale={locale} /></div></div><p><strong>{translate(locale, "issue.impact")}</strong> {copy.impact}</p><p><strong>{translate(locale, "issue.owner")}</strong> {copy.owner}</p><p><strong>{translate(locale, "issue.how")}</strong> {copy.fix}</p>{type === "technical" && <><dl><div><dt>{translate(locale, "issue.status")}</dt><dd>{translate(locale, `checkStatuses.${result.checks?.[item.code]?.status || "not_evaluated"}`)}</dd></div><div><dt>{translate(locale, "issue.evidence")}</dt><dd>{item.evidence}</dd></div><div><dt>{translate(locale, "issue.confidence")}</dt><dd>{item.confidence}% · {translate(locale, `confidenceBases.${item.confidenceBasis}`)}</dd></div><div><dt>Header</dt><dd>{item.technical?.header || translate(locale, "common.notAvailable")}</dd></div><div><dt>CWE / CVSS</dt><dd>{item.technical?.cwe || translate(locale, "common.notAvailable")} / {item.technical?.cvss || translate(locale, "common.notAvailable")}</dd></div></dl><PlaybookReferences sources={playbook?.sources} locale={locale} compact /></>}</div>;
      }) : <p>{translate(locale, "result.clearDetail")}</p>}</section>
      {type === "technical" && <section className="report-section report-technical"><h2>{translate(locale, "issue.technical")}</h2><dl><div><dt>URL</dt><dd>{result.finalUrl}</dd></div><div><dt>{translate(locale, "issue.httpStatus")}</dt><dd>{result.statusCode}</dd></div><div><dt>TLS</dt><dd>{result.responseMeta?.tlsProtocol || translate(locale, "common.notAvailable")}</dd></div><div><dt>Transport</dt><dd>{result.responseMeta?.transport || translate(locale, "common.notAvailable")}</dd></div><div><dt>{translate(locale, "issue.technology")}</dt><dd>{result.technologyEvidence?.map(({ name, confidence }) => `${name} (${confidence}%)`).join(", ") || translate(locale, "common.notAvailable")}</dd></div><div><dt>{translate(locale, "issue.coverage")}</dt><dd>{coverage}</dd></div></dl><p>{translate(locale, "result.indicatorHelp")}</p></section>}
      <footer className="report-footer"><p>{translate(locale, "report.disclaimer")}</p><span>fixfirst · {result.domain}</span></footer>
    </article>
  );
}

export default function FixFirstApp() {
  const [locale, setLocale] = useState("pt-BR");
  const [view, setView] = useState("start");
  const [urlInput, setUrlInput] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [scanKind, setScanKind] = useState("scan");
  const [errorKey, setErrorKey] = useState("generic");
  const [presentationMode, setPresentationMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState("simple");
  const [reportLocale, setReportLocale] = useState("pt-BR");
  const [reportPreview, setReportPreview] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [retestData, setRetestData] = useState(null);
  const trackedViewRef = useRef(null);
  const t = (path, values) => translate(locale, path, values);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let initialLocale = "pt-BR";
      try {
        const savedLocale = localStorage.getItem(STORAGE_LOCALE);
        if (locales.some(({ code }) => code === savedLocale)) {
          initialLocale = savedLocale;
          setLocale(savedLocale);
          setReportLocale(savedLocale);
        }
        const savedHistory = JSON.parse(localStorage.getItem(STORAGE_HISTORY) || "[]");
        if (Array.isArray(savedHistory)) setHistory(savedHistory.slice(0, 8));
      } catch {}
      captureAnalytics(ANALYTICS_EVENTS.PAGE_VIEW, { locale: initialLocale });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(STORAGE_LOCALE, locale);
  }, [locale]);

  const selectedIssue = useMemo(() => {
    if (!result?.findings?.length) return null;
    return result.findings.find(({ id }) => id === selectedIssueId) || result.findings[0];
  }, [result, selectedIssueId]);

  useEffect(() => {
    let key = null;
    let events = [];

    if (view === "summary" && result) {
      key = `summary:${result.analyzedAt}`;
      const resultScanType = result.authorizationRecord?.analysisType === "passive_retest" ? "retest" : "initial";
      events = [[ANALYTICS_EVENTS.RESULT_VIEWED, resultAnalyticsProperties(result, locale, resultScanType)]];
    } else if (view === "issues" && selectedIssue) {
      key = `issues:${result?.analyzedAt}:${selectedIssue.id}`;
      const properties = issueAnalyticsProperties(selectedIssue, locale);
      events = [
        [ANALYTICS_EVENTS.PRIORITY_VIEWED, properties],
        [ANALYTICS_EVENTS.SIMPLE_GUIDE_OPENED, properties],
      ];
    } else if (view === "route" && selectedIssue && result) {
      key = `route:${result.analyzedAt}:${selectedIssue.id}`;
      const playbook = getPlaybook(selectedIssue.code, locale, result.technologyEvidence);
      events = [[ANALYTICS_EVENTS.TECHNICAL_PLAYBOOK_OPENED, {
        locale,
        finding_code: selectedIssue.code,
        playbook_variant: playbook?.technology ? "technology_specific" : "generic",
      }]];
    }

    if (!key) {
      trackedViewRef.current = null;
      return;
    }
    if (trackedViewRef.current === key) return;
    trackedViewRef.current = key;
    for (const [event, properties] of events) captureAnalytics(event, properties);
  }, [locale, result, selectedIssue, view]);

  function persistHistory(nextResult, kind = "scan", fixedCode = null) {
    setHistory((current) => {
      const previous = current.find((item) => item.domain === nextResult.domain);
      const entry = {
        domain: nextResult.domain,
        firstAnalyzedAt: previous?.firstAnalyzedAt || nextResult.analyzedAt,
        lastAnalyzedAt: nextResult.analyzedAt,
        firstScore: previous?.firstScore ?? nextResult.score,
        currentScore: nextResult.score,
        fixedCount: (previous?.fixedCount || 0) + (kind === "retest" && fixedCode ? 1 : 0),
        pendingCount: nextResult.findings.length,
        latest: nextResult,
      };
      const updated = [entry, ...current.filter((item) => item.domain !== nextResult.domain)].slice(0, 8);
      try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  function submitUrl(event) {
    event.preventDefault();
    const normalized = clientNormalizeUrl(urlInput);
    if (!normalized) {
      setUrlError(t("start.invalid"));
      return;
    }
    setUrlError("");
    captureAnalytics(ANALYTICS_EVENTS.SCAN_URL_SUBMITTED, { locale });
    setTargetUrl(normalized);
    setAuthorized(false);
    setAuthError(false);
    setView("auth");
  }

  function mapError(code) {
    if (["INVALID_URL", "BLOCKED_TARGET", "INVALID_REDIRECT", "TOO_MANY_REDIRECTS"].includes(code)) return "blocked";
    if (code === "SCAN_TIMEOUT") return "timeout";
    if (code === "RATE_LIMITED") return "rate";
    if (["DNS_FAILED", "FETCH_FAILED", "TLS_INVALID", "INVALID_RESPONSE", "UNSUPPORTED_RESPONSE", "RESPONSE_HEADERS_TOO_LARGE"].includes(code)) return "unavailable";
    return "generic";
  }

  async function performScan({ retest = false } = {}) {
    if (!authorized) {
      setAuthError(true);
      return;
    }

    const previousIssue = retest ? selectedIssue : null;
    const scanType = retest ? "retest" : "initial";
    if (retest && previousIssue) {
      captureAnalytics(ANALYTICS_EVENTS.RETEST_STARTED, {
        locale,
        finding_code: previousIssue.code,
      });
    } else {
      captureAnalytics(ANALYTICS_EVENTS.SCAN_STARTED, { locale, scan_type: scanType });
    }
    setScanKind(retest ? "retest" : "scan");
    setView("scanning");

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, authorized: true, retestCode: previousIssue?.code || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.error || "SCAN_FAILED"), { code: payload.error || "SCAN_FAILED" });

      const next = payload.result;

      if (retest && previousIssue) {
        const stillPresent = next.findings.find(({ code }) => code === previousIssue.code);
        const retestStatus = next.retest?.status || "not_evaluated";
        const conclusive = next.retest?.conclusive === true;
        const fixed = conclusive && next.retest?.fixed === true;
        const retestOutcome = fixed ? "fixed" : conclusive ? "pending" : "inconclusive";
        captureAnalytics(ANALYTICS_EVENTS.RETEST_COMPLETED, {
          locale,
          finding_code: previousIssue.code,
          retest_outcome: retestOutcome,
          conclusive,
        });
        if (fixed) {
          captureAnalytics(ANALYTICS_EVENTS.FIX_CONFIRMED, {
            locale,
            finding_code: previousIssue.code,
          });
        }
        setRetestData({ before: previousIssue, beforeAnalyzedAt: result?.analyzedAt || new Date().toISOString(), after: stillPresent || null, fixed, conclusive, status: retestStatus, testedAt: next.analyzedAt });
        setResult(next);
        setSelectedIssueId(stillPresent?.id || next.findings[0]?.id || null);
        persistHistory(next, "retest", fixed ? previousIssue.code : null);
        setView("retest");
      } else {
        captureAnalytics(ANALYTICS_EVENTS.SCAN_COMPLETED, {
          ...resultAnalyticsProperties(next, locale, scanType),
          transport: ["pinned_socket", "platform_fetch"].includes(next.responseMeta?.transport) ? next.responseMeta.transport : "unknown",
        });
        setResult(next);
        setSelectedIssueId(next.findings[0]?.id || null);
        persistHistory(next);
        setView("summary");
      }
    } catch (error) {
      captureAnalytics(ANALYTICS_EVENTS.SCAN_FAILED, {
        locale,
        scan_type: scanType,
        error_category: analyticsErrorCategory(error?.code),
      });
      setErrorKey(mapError(error?.code));
      setView("error");
    }
  }

  function authorizeAndScan() {
    if (!authorized) {
      setAuthError(true);
      return;
    }
    setAuthError(false);
    captureAnalytics(ANALYTICS_EVENTS.SCAN_AUTHORIZED, { locale });
    performScan();
  }

  function reset() {
    setView("start");
    setUrlInput("");
    setTargetUrl("");
    setAuthorized(false);
    setResult(null);
    setRetestData(null);
    setShowAll(false);
    setPresentationMode(false);
  }

  function openHistoryItem(item) {
    setResult(item.latest);
    setTargetUrl(item.latest.requestedUrl || item.latest.finalUrl);
    setSelectedIssueId(item.latest.findings[0]?.id || null);
    setAuthorized(true);
    setHistoryOpen(false);
    setView("summary");
  }

  function clearHistory() {
    setHistory([]);
    localStorage.removeItem(STORAGE_HISTORY);
  }

  const developerMessage = useMemo(() => {
    if (!selectedIssue || !result) return "";
    const copy = issueCopy(locale, selectedIssue.code);
    const playbook = getPlaybook(selectedIssue.code, locale, result.technologyEvidence);
    const basis = translate(locale, `confidenceBases.${selectedIssue.confidenceBasis}`);
    const sourceLines = playbook?.sources?.map((source) => `${source.label}: ${source.url}`) || [];
    return [
      translate(locale, "devMessage.subject", { domain: result.domain }),
      "",
      translate(locale, "devMessage.intro", { domain: result.domain, priority: translate(locale, `levels.${selectedIssue.priority}`) }),
      "",
      copy.title,
      copy.found,
      "",
      translate(locale, "devMessage.evidence", { evidence: selectedIssue.evidence }),
      translate(locale, "devMessage.confidence", { confidence: selectedIssue.confidence, basis }),
      "",
      translate(locale, "devMessage.request", { fix: copy.fix }),
      ...(playbook?.steps?.length ? ["", ...playbook.steps.map((step, index) => `${index + 1}. ${step}`)] : []),
      ...(playbook?.validation?.[0] ? ["", translate(locale, "devMessage.validation", { validation: playbook.validation[0] })] : []),
      ...(sourceLines.length ? ["", translate(locale, "devMessage.sources"), ...sourceLines] : []),
      "",
      translate(locale, "devMessage.close"),
    ].join("\n");
  }, [locale, result, selectedIssue]);

  async function copyDeveloperMessage() {
    try {
      await navigator.clipboard.writeText(developerMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  function printReport() {
    setTimeout(() => window.print(), 80);
  }

  function openDeveloperMessage() {
    if (selectedIssue) {
      captureAnalytics(ANALYTICS_EVENTS.DEVELOPER_MESSAGE_GENERATED, {
        locale,
        finding_code: selectedIssue.code,
      });
    }
    setDeveloperOpen(true);
  }

  function generateReport() {
    captureAnalytics(ANALYTICS_EVENTS.REPORT_GENERATED, {
      locale,
      report_type: reportType,
      report_locale: reportLocale,
    });
    setReportPreview(true);
  }

  function changeLocale(nextLocale) {
    if (nextLocale !== locale) {
      captureAnalytics(ANALYTICS_EVENTS.LANGUAGE_CHANGED, {
        locale: nextLocale,
        previous_locale: locale,
        next_locale: nextLocale,
      });
    }
    setLocale(nextLocale);
    setReportLocale(nextLocale);
  }

  const showBack = ["auth", "issues", "route", "retest", "error"].includes(view);
  const backAction = () => {
    if (view === "auth" || view === "error") setView(view === "auth" ? "start" : (result ? "summary" : "auth"));
    else if (view === "issues") setView("summary");
    else if (view === "route") setView("issues");
    else if (view === "retest") setView("issues");
  };

  return (
    <div className={classNames("app-shell", presentationMode && "presentation-mode")}>
      <header className="topbar">
        <button type="button" className="brand" onClick={reset} aria-label={`FixFirst, ${t("home")}`}>
          <Image src="/mark.svg" width={36} height={36} alt="" priority />
          <span><strong>FixFirst</strong><small>{t("brandTagline")}</small></span>
        </button>

        <div className="topbar-center">{targetUrl && view !== "start" && <span className="current-domain"><i />{displayDomain(targetUrl)}</span>}</div>

        <div className="top-actions">
          {result && <button type="button" className={classNames("quiet-button", presentationMode && "active")} onClick={() => setPresentationMode((value) => !value)} aria-pressed={presentationMode}><Icon name="monitor" size={18} /><span>{presentationMode ? t("exitPresentation") : t("presentation")}</span></button>}
          <label className="language-select"><span className="sr-only">{t("language")}</span><select value={locale} onChange={(event) => changeLocale(event.target.value)}>{locales.map(({ code, label }) => <option key={code} value={code}>{code === "pt-BR" ? "PT-BR" : code.toUpperCase()} · {label}</option>)}</select><Icon name="chevronDown" size={15} /></label>
          <button type="button" className="icon-button hide-on-mobile" onClick={() => setHistoryOpen(true)} aria-label={t("history")}><Icon name="history" /></button>
        </div>
      </header>

      <main className={classNames("main", `view-${view}`)}>
        {showBack && view !== "error" && <button type="button" className="back-button" onClick={backAction}><Icon name="arrowLeft" size={18} />{t("back")}</button>}

        {view === "start" && (
          <section className="start-view">
            <div className="start-copy"><span className="eyebrow">{t("start.eyebrow")}</span><h1>{t("start.title")}</h1><p>{t("start.subtitle")}</p></div>
            <form className="url-form" onSubmit={submitUrl} noValidate>
              <label htmlFor="site-url">{t("start.label")}</label>
              <div className={classNames("url-control", urlError && "has-error")}><Icon name="lock" size={19} /><input id="site-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={urlInput} onChange={(event) => { setUrlInput(event.target.value); setUrlError(""); }} placeholder={t("start.placeholder")} aria-describedby={urlError ? "url-error" : "url-note"} aria-invalid={Boolean(urlError)} autoFocus /><button className="button button-primary" type="submit">{t("start.button")}<Icon name="arrowRight" size={18} /></button></div>
              {urlError ? <p id="url-error" className="field-error"><Icon name="warning" size={16} />{urlError}</p> : <p id="url-note" className="form-note"><Icon name="shield" size={16} />{t("start.note")}</p>}
            </form>
          </section>
        )}

        {view === "auth" && (
          <section className="flow-card auth-card">
            <div className="flow-heading"><span className="eyebrow">{t("auth.eyebrow")}</span><h1>{t("auth.title")}</h1><p>{t("auth.description")}</p></div>
            <div className="domain-box"><span>{t("auth.domain")}</span><strong><span className="domain-icon"><Icon name="lock" size={17} /></span>{displayDomain(targetUrl)}</strong></div>
            <label className={classNames("check-row", authError && "has-error")}><input type="checkbox" checked={authorized} onChange={(event) => { setAuthorized(event.target.checked); setAuthError(false); }} aria-invalid={authError} aria-describedby={authError ? "auth-error" : undefined} /><span className="custom-check"><Icon name="check" size={15} /></span><span>{t("auth.checkbox")}</span></label>
            {authError && <p id="auth-error" className="field-error"><Icon name="warning" size={16} />{t("auth.required")}</p>}
            <div className="notice"><Icon name="info" size={20} /><div><strong>{t("auth.passiveTitle")}</strong><p>{t("auth.passiveText")}</p></div></div>
            <div className="flow-actions"><button type="button" className="button button-primary" onClick={authorizeAndScan}>{t("auth.button")}<Icon name="arrowRight" size={18} /></button><button type="button" className="button button-ghost" onClick={reset}>{t("auth.cancel")}</button></div>
          </section>
        )}

        {view === "scanning" && (
          <section className="scan-view" aria-live="polite">
            <div className="scan-orbit"><div className="scan-mark"><Icon name={scanKind === "retest" ? "refresh" : "shield"} size={30} /></div><span /><span /></div>
            <div className="scan-copy"><h1>{t("scan.title", { domain: displayDomain(targetUrl) })}</h1><p>{t("scan.subtitle")}</p></div>
            <div className="progress-wrap"><div className="progress-meta"><span>{t("scan.status")}</span></div><div className="progress-track progress-indeterminate" role="progressbar" aria-label={t("scan.progress")}><span /></div></div>
            <p className="scan-note">{t("scan.note")}</p>
          </section>
        )}

        {view === "summary" && result && (
          <section className="summary-view">
            <div className="summary-icon"><Icon name={result.importantCount > 0 ? "warning" : "shield"} size={28} /></div>
            <div className="summary-copy"><span className="eyebrow">{t("result.eyebrow")}</span><h1>{result.importantCount > 0 ? t("result.attention") : t("result.clear")}</h1><p>{result.findings.length ? <>{t("result.found", { count: result.findings.length })}<br /><strong>{result.importantCount > 0 ? t("result.first", { count: result.importantCount }) : t("result.reviewNext")}</strong></> : t("result.clearDetail")}</p></div>
            <Score value={result.score} locale={locale} />
            <div className="summary-actions">{result.findings.length > 0 && <button type="button" className="button button-primary button-large" onClick={() => setView("issues")}>{t("result.viewFirst")}<Icon name="arrowRight" size={19} /></button>}<button type="button" className="button button-secondary" onClick={() => { setReportOpen(true); setReportPreview(false); }}>{t("result.report")}<Icon name="file" size={18} /></button></div>
            <p className="scope-note">{t("result.scope")}</p>
            <button type="button" className="text-button new-scan" onClick={reset}>{t("result.newScan")}</button>
          </section>
        )}

        {view === "issues" && result && selectedIssue && <IssueView issue={selectedIssue} result={result} locale={locale} onFix={() => setView("route")} showAll={showAll} onToggleAll={() => setShowAll((value) => !value)} presentationMode={presentationMode} />}

        {view === "route" && result && selectedIssue && <RouteView issue={selectedIssue} result={result} locale={locale} onRetest={() => performScan({ retest: true })} onDeveloper={openDeveloperMessage} />}

        {view === "retest" && result && retestData && (
          <section className="retest-view"><div className={classNames("retest-status", retestData.fixed ? "fixed" : retestData.conclusive ? "pending" : "inconclusive")}><div><Icon name={retestData.fixed ? "check" : retestData.conclusive ? "warning" : "info"} size={30} /></div><span className="eyebrow">{t("retest.eyebrow")}</span><h1>{retestData.fixed ? t("retest.fixed") : retestData.conclusive ? t("retest.pending") : t("retest.inconclusive")}</h1><p>{retestData.fixed ? t("retest.fixedText") : retestData.conclusive ? t("retest.pendingText") : t("retest.inconclusiveText")}</p></div><div className="before-after"><div><span>{t("retest.before")}</span><strong>{t("retest.detected")}</strong><small>{formatDate(retestData.beforeAnalyzedAt, locale)}</small></div><Icon name="arrowRight" size={22} /><div className={retestData.fixed ? "after-fixed" : "after-pending"}><span>{t("retest.after")}</span><strong>{retestData.fixed ? t("retest.confirmed") : retestData.conclusive ? t("retest.pending") : t("retest.inconclusive")}</strong><small>{formatDate(retestData.testedAt, locale)}</small></div></div><div className="retest-actions">{!retestData.fixed && <button type="button" className="button button-primary" onClick={() => performScan({ retest: true })}><Icon name="refresh" size={18} />{t("retest.testAgain")}</button>}<button type="button" className="button button-secondary" onClick={() => setView(result.findings.length ? "issues" : "summary")}>{t("retest.backResult")}</button></div></section>
        )}

        {view === "error" && (
          <section className="error-view"><div className="error-icon"><Icon name="warning" size={28} /></div><h1>{t(`errors.${errorKey}`)}</h1><p>{t("result.scope")}</p><div><button type="button" className="button button-primary" onClick={() => performScan()}>{t("errors.retry")}<Icon name="refresh" size={18} /></button><button type="button" className="button button-ghost" onClick={reset}>{t("result.newScan")}</button></div></section>
        )}
      </main>

      <footer className="app-footer"><span>FixFirst</span><span>·</span><span>{t("start.note")}</span></footer>

      {historyOpen && <Modal title={t("historyPanel.title")} closeLabel={t("close")} onClose={() => setHistoryOpen(false)}><div className="history-content"><p className="history-privacy">{t("historyPanel.privacy")}</p>{history.length === 0 ? <div className="empty-state"><Icon name="history" size={28} /><p>{t("historyPanel.empty")}</p></div> : <>{history.map((item) => <button type="button" className="history-item" key={item.domain} onClick={() => openHistoryItem(item)}><div><strong>{item.domain}</strong><span>{formatDate(item.lastAnalyzedAt, locale, true)}</span></div><div className="history-score"><strong>{item.currentScore}</strong><span>/100</span><Icon name="arrowRight" size={17} /></div></button>)}<button type="button" className="text-button clear-history" onClick={clearHistory}>{t("historyPanel.clear")}</button></>}</div></Modal>}

      {developerOpen && <Modal title={t("route.devTitle")} closeLabel={t("close")} onClose={() => setDeveloperOpen(false)}><div className="developer-modal"><p>{t("route.devHint")}</p><textarea readOnly value={developerMessage} rows={13} aria-label={t("route.devTitle")} /><button type="button" className="button button-primary button-full" onClick={copyDeveloperMessage}><Icon name={copied ? "check" : "copy"} size={18} />{copied ? t("route.copied") : t("route.copy")}</button></div></Modal>}

      {reportOpen && result && <Modal title={t("report.title")} closeLabel={t("close")} onClose={() => { setReportOpen(false); setReportPreview(false); }} wide={reportPreview} printClass={reportPreview ? "print-modal" : ""}>{!reportPreview ? <div className="report-options"><p>{t("report.subtitle")}</p><div className="report-type-grid"><button type="button" className={reportType === "simple" ? "selected" : ""} aria-pressed={reportType === "simple"} onClick={() => setReportType("simple")}><span className="soft-icon"><Icon name="file" size={20} /></span><strong>{t("report.simple")}</strong><small>{t("report.simpleHelp")}</small><i><Icon name="check" size={14} /></i></button><button type="button" className={reportType === "technical" ? "selected" : ""} aria-pressed={reportType === "technical"} onClick={() => setReportType("technical")}><span className="soft-icon"><Icon name="monitor" size={20} /></span><strong>{t("report.technical")}</strong><small>{t("report.technicalHelp")}</small><i><Icon name="check" size={14} /></i></button></div><label className="report-language"><span>{t("report.language")}</span><select value={reportLocale} onChange={(event) => setReportLocale(event.target.value)}>{locales.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}</select></label><button type="button" className="button button-primary button-full" onClick={generateReport}>{t("report.generate")}<Icon name="arrowRight" size={18} /></button></div> : <><div className="report-toolbar hide-on-print"><button type="button" className="button button-ghost" onClick={() => setReportPreview(false)}><Icon name="arrowLeft" size={18} />{t("back")}</button><div><span>{translate(reportLocale, "report.printHint")}</span><button type="button" className="button button-primary" onClick={printReport}><Icon name="download" size={18} />{translate(reportLocale, "report.print")}</button></div></div><ReportDocument result={result} locale={reportLocale} type={reportType} /></>}</Modal>}
    </div>
  );
}
