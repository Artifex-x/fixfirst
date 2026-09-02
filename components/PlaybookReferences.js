import { createElement } from "react";
import { getSafeExternalReferences } from "../lib/external-references.js";
import { translate } from "../lib/i18n.js";

export default function PlaybookReferences({ sources, locale, compact = false }) {
  const references = getSafeExternalReferences(sources);
  if (!references.length) return null;

  const Heading = compact ? "h4" : "h3";
  const className = ["playbook-references", !compact && "playbook-section", compact && "report-sources"].filter(Boolean).join(" ");

  return createElement(
    "section",
    { className },
    createElement(Heading, null, translate(locale, "route.sources")),
    createElement(
      "ul",
      null,
      references.map((source) => createElement(
        "li",
        { key: source.url },
        createElement(
          "a",
          { href: source.url, target: "_blank", rel: "noopener noreferrer" },
          source.label,
          createElement("span", { className: "sr-only" }, ` (${translate(locale, "common.opensNewTab")})`),
        ),
      )),
    ),
  );
}
