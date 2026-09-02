import test from "node:test";
import assert from "node:assert/strict";
import { applySiteSecurityHeaders, SITE_SECURITY_HEADERS } from "../lib/security-headers.js";

test("the page header helper applies every configured security header", () => {
  const headers = applySiteSecurityHeaders(new Headers());

  for (const { key, value } of SITE_SECURITY_HEADERS) {
    assert.equal(headers.get(key), value);
  }
});
