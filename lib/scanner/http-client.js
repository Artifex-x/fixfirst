import { Buffer } from "node:buffer";
import net from "node:net";
import tls from "node:tls";
import { normalizeUrlInput, resolveSafeTarget, ScanTargetError, validateRedirectUrl } from "./validate-url.js";

const MAX_BODY_BYTES = 512 * 1024;
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;
const TOTAL_TIMEOUT_MS = 12_000;

export const scannerLimits = Object.freeze({
  maxBodyBytes: MAX_BODY_BYTES,
  maxHeaderBytes: MAX_HEADER_BYTES,
  maxRedirects: MAX_REDIRECTS,
  totalTimeoutMs: TOTAL_TIMEOUT_MS,
});

function publicUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function timeoutError() {
  return new ScanTargetError("SCAN_TIMEOUT");
}

async function beforeDeadline(promise, deadlineAt) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw timeoutError();

  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError()), remaining);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function parseHeaderBlock(block) {
  const lines = block.toString("latin1").split("\r\n");
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s|$)/i.exec(lines.shift() || "");
  if (!statusMatch) throw new ScanTargetError("INVALID_RESPONSE");

  const headers = {};
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!name) continue;
    if (name === "set-cookie") {
      headers[name] = [...(Array.isArray(headers[name]) ? headers[name] : []), value];
    } else {
      headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
    }
  }

  return { status: Number(statusMatch[1]), headers };
}

function decodeChunkedBody(input) {
  const chunks = [];
  let outputBytes = 0;
  let offset = 0;

  while (offset < input.length) {
    const lineEnd = input.indexOf("\r\n", offset, "latin1");
    if (lineEnd < 0) return { complete: false, body: Buffer.concat(chunks, outputBytes), truncated: false };

    const sizeText = input.toString("latin1", offset, lineEnd).split(";", 1)[0].trim();
    if (!/^[0-9a-f]+$/i.test(sizeText)) throw new ScanTargetError("INVALID_RESPONSE");
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isSafeInteger(size)) throw new ScanTargetError("INVALID_RESPONSE");
    offset = lineEnd + 2;

    if (size === 0) return { complete: true, body: Buffer.concat(chunks, outputBytes), truncated: false };

    const available = Math.max(0, input.length - offset);
    const neededForLimit = MAX_BODY_BYTES - outputBytes;
    if (neededForLimit <= 0) return { complete: true, body: Buffer.concat(chunks, outputBytes), truncated: true };

    if (available >= neededForLimit && size > neededForLimit) {
      chunks.push(input.subarray(offset, offset + neededForLimit));
      outputBytes += neededForLimit;
      return { complete: true, body: Buffer.concat(chunks, outputBytes), truncated: true };
    }

    if (available < size + 2) return { complete: false, body: Buffer.concat(chunks, outputBytes), truncated: false };
    if (input[offset + size] !== 13 || input[offset + size + 1] !== 10) throw new ScanTargetError("INVALID_RESPONSE");

    chunks.push(input.subarray(offset, offset + size));
    outputBytes += size;
    offset += size + 2;
  }

  return { complete: false, body: Buffer.concat(chunks, outputBytes), truncated: false };
}

function tlsDetails(socket, hostname) {
  try {
    const certificate = socket.getPeerCertificate?.(false) || null;
    const identityError = certificate && Object.keys(certificate).length
      ? tls.checkServerIdentity(hostname, certificate)
      : null;
    const authorizationError = identityError?.code || socket.authorizationError || null;
    return {
      protocol: socket.getProtocol?.() || null,
      authorized: Boolean(socket.authorized) && !identityError,
      authorizationError: authorizationError ? String(authorizationError) : null,
      validFrom: certificate?.valid_from || null,
      validTo: certificate?.valid_to || null,
      issuer: certificate?.issuer?.CN || null,
      subject: certificate?.subject?.CN || null,
    };
  } catch {
    return {
      protocol: socket.getProtocol?.() || null,
      authorized: Boolean(socket.authorized),
      authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
      validFrom: null,
      validTo: null,
      issuer: null,
      subject: null,
    };
  }
}

function defaultConnect({ address, family, hostname, port, secure }) {
  if (secure) {
    return tls.connect({
      host: address,
      port,
      family,
      servername: net.isIP(hostname) ? undefined : hostname,
      rejectUnauthorized: false,
    });
  }
  return net.connect({ host: address, port, family });
}

function responseHeaders(headers) {
  const result = {};
  let totalBytes = 0;
  for (const [name, value] of headers.entries()) {
    totalBytes += name.length + value.length + 4;
    if (totalBytes > MAX_HEADER_BYTES) throw new ScanTargetError("RESPONSE_HEADERS_TOO_LARGE");
    result[name.toLowerCase()] = value;
  }

  if (typeof headers.getSetCookie === "function") {
    const cookies = headers.getSetCookie();
    if (cookies.length) result["set-cookie"] = cookies;
  }
  return result;
}

async function readPlatformBody(response) {
  const contentType = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const bodyAnalyzed = ["text/html", "application/xhtml+xml"].includes(contentType);
  if (!bodyAnalyzed || !response.body) return { body: "", truncated: false, bodyAnalyzed, contentType: contentType || null };

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = MAX_BODY_BYTES - total;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }
    const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(chunk);
    total += chunk.byteLength;
    if (value.byteLength > remaining || total >= MAX_BODY_BYTES) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder("utf-8", { fatal: false }).decode(combined), truncated, bodyAnalyzed, contentType: contentType || null };
}

async function requestWithPlatformFetch(target, deadlineAt) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw timeoutError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);

  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
        "User-Agent": "FixFirst-Passive-Check/0.2 (+defensive-security-review)",
      },
    });
    const content = await readPlatformBody(response);
    return {
      url: publicUrl(target.url),
      status: response.status,
      headers: responseHeaders(response.headers),
      ...content,
      tls: null,
      transport: "platform_fetch",
    };
  } catch (error) {
    if (error?.name === "AbortError") throw timeoutError();
    if (error instanceof ScanTargetError) throw error;
    throw new ScanTargetError("FETCH_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

function requestPinned(target, deadlineAt, connectFactory = defaultConnect) {
  const { url, address, family } = target;
  const secure = url.protocol === "https:";
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port || (secure ? 443 : 80));
  const path = `${url.pathname || "/"}${url.search}`;

  return new Promise((resolve, reject) => {
    let socket;
    let timer;
    let settled = false;
    let headersParsed = false;
    let headerBytes = 0;
    let pending = Buffer.alloc(0);
    let encodedBody = Buffer.alloc(0);
    let status = 0;
    let headers = {};
    let expectedLength = null;
    let isChunked = false;
    let bodyTruncated = false;
    let bodyAnalyzed = false;
    let tlsInfo = null;

    const cleanup = () => {
      clearTimeout(timer);
      if (socket && !socket.destroyed) socket.destroy();
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error instanceof ScanTargetError) reject(error);
      else reject(new ScanTargetError("FETCH_FAILED"));
    };

    const finish = (bodyBuffer = encodedBody, truncated = bodyTruncated) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        url: publicUrl(url),
        status,
        headers,
        body: bodyAnalyzed ? new TextDecoder("utf-8", { fatal: false }).decode(bodyBuffer) : "",
        truncated,
        bodyAnalyzed,
        contentType: String(headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase() || null,
        tls: secure ? tlsInfo : null,
        transport: "pinned_socket",
      });
    };

    const evaluateBody = () => {
      if (!headersParsed || settled) return;

      if (isChunked) {
        const decoded = decodeChunkedBody(encodedBody);
        if (decoded.complete) finish(decoded.body, decoded.truncated);
        return;
      }

      if (expectedLength !== null) {
        const targetLength = Math.min(expectedLength, MAX_BODY_BYTES);
        if (encodedBody.length >= targetLength) finish(encodedBody.subarray(0, targetLength), expectedLength > MAX_BODY_BYTES);
        return;
      }

      if (encodedBody.length >= MAX_BODY_BYTES) finish(encodedBody.subarray(0, MAX_BODY_BYTES), true);
    };

    const acceptFinalHeaders = (parsed, rest) => {
      status = parsed.status;
      headers = parsed.headers;
      headersParsed = true;

      const contentType = String(headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
      const contentEncoding = String(headers["content-encoding"] || "identity").trim().toLowerCase();
      bodyAnalyzed = ["text/html", "application/xhtml+xml"].includes(contentType) && ["", "identity"].includes(contentEncoding);
      if (!bodyAnalyzed || status === 204 || status === 304) {
        finish(Buffer.alloc(0), false);
        return;
      }

      isChunked = /(?:^|,)\s*chunked\s*(?:,|$)/i.test(String(headers["transfer-encoding"] || ""));
      const lengthText = String(headers["content-length"] || "").trim();
      if (!isChunked && /^\d+$/.test(lengthText)) expectedLength = Number(lengthText);
      if (expectedLength !== null && (!Number.isSafeInteger(expectedLength) || expectedLength < 0)) {
        fail(new ScanTargetError("INVALID_RESPONSE"));
        return;
      }

      const encodedLimit = MAX_BODY_BYTES + MAX_HEADER_BYTES;
      encodedBody = rest.subarray(0, encodedLimit);
      bodyTruncated = rest.length > encodedLimit;
      evaluateBody();
    };

    const parseAvailableHeaders = () => {
      while (!headersParsed && !settled) {
        const separator = pending.indexOf("\r\n\r\n", 0, "latin1");
        if (separator < 0) {
          if (headerBytes + pending.length > MAX_HEADER_BYTES) fail(new ScanTargetError("RESPONSE_HEADERS_TOO_LARGE"));
          return;
        }

        const block = pending.subarray(0, separator);
        pending = pending.subarray(separator + 4);
        headerBytes += block.length + 4;
        if (headerBytes > MAX_HEADER_BYTES) {
          fail(new ScanTargetError("RESPONSE_HEADERS_TOO_LARGE"));
          return;
        }

        let parsed;
        try {
          parsed = parseHeaderBlock(block);
        } catch (error) {
          fail(error);
          return;
        }

        if (parsed.status >= 100 && parsed.status < 200 && parsed.status !== 101) continue;
        if (parsed.status === 101) {
          fail(new ScanTargetError("UNSUPPORTED_RESPONSE"));
          return;
        }
        acceptFinalHeaders(parsed, pending);
      }
    };

    const onData = (chunk) => {
      if (settled) return;
      const bytes = Buffer.from(chunk);
      if (!headersParsed) {
        pending = Buffer.concat([pending, bytes], pending.length + bytes.length);
        parseAvailableHeaders();
        return;
      }

      const encodedLimit = MAX_BODY_BYTES + MAX_HEADER_BYTES;
      const remaining = Math.max(0, encodedLimit - encodedBody.length);
      if (bytes.length > remaining) bodyTruncated = true;
      if (remaining > 0) encodedBody = Buffer.concat([encodedBody, bytes.subarray(0, remaining)], encodedBody.length + Math.min(bytes.length, remaining));
      try {
        evaluateBody();
      } catch (error) {
        fail(error);
      }
      if (!settled && bodyTruncated) {
        if (isChunked) {
          try {
            const decoded = decodeChunkedBody(encodedBody);
            finish(decoded.body, true);
          } catch (error) {
            fail(error);
          }
        } else {
          finish(encodedBody.subarray(0, MAX_BODY_BYTES), true);
        }
      }
    };

    const onConnected = () => {
      if (secure) tlsInfo = tlsDetails(socket, hostname);
      const request = [
        `GET ${path} HTTP/1.1`,
        `Host: ${url.host}`,
        "Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
        "Accept-Encoding: identity",
        "User-Agent: FixFirst-Passive-Check/0.2 (+defensive-security-review)",
        "Connection: close",
        "",
        "",
      ].join("\r\n");
      socket.write(request);
    };

    try {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) return fail(timeoutError());
      socket = connectFactory({ address, family, hostname, port, secure, url });
      timer = setTimeout(() => fail(timeoutError()), remaining);
      socket.on("data", onData);
      socket.once("error", fail);
      socket.once("end", () => {
        if (settled) return;
        if (!headersParsed) return fail(new ScanTargetError("INVALID_RESPONSE"));
        if (isChunked) {
          try {
            const decoded = decodeChunkedBody(encodedBody);
            if (!decoded.complete && !decoded.truncated) return fail(new ScanTargetError("INVALID_RESPONSE"));
            return finish(decoded.body, decoded.truncated);
          } catch (error) {
            return fail(error);
          }
        }
        const body = encodedBody.subarray(0, MAX_BODY_BYTES);
        finish(body, bodyTruncated || encodedBody.length > MAX_BODY_BYTES || (expectedLength !== null && encodedBody.length < expectedLength));
      });
      socket.once(secure ? "secureConnect" : "connect", onConnected);
    } catch (error) {
      fail(error);
    }
  });
}

async function requestOnce(target, options) {
  const resolved = await beforeDeadline(options.resolveTarget(target), options.deadlineAt);
  if (options.transport === "platform_fetch") return requestWithPlatformFetch(resolved, options.deadlineAt);
  return requestPinned(resolved, options.deadlineAt, options.connectFactory);
}

export async function fetchPublicPage(rawUrl, options = {}) {
  let current = rawUrl instanceof URL ? validateRedirectUrl(rawUrl) : normalizeUrlInput(rawUrl);
  const deadlineAt = options.deadlineAt || Date.now() + (options.timeoutMs || TOTAL_TIMEOUT_MS);
  const requestOptions = {
    deadlineAt,
    resolveTarget: options.resolveTarget || resolveSafeTarget,
    connectFactory: options.connectFactory || defaultConnect,
    transport: options.transport === "platform_fetch" ? "platform_fetch" : "pinned_socket",
  };

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const result = await requestOnce(current, requestOptions);
    const location = result.headers.location;
    const isRedirect = [301, 302, 303, 307, 308].includes(result.status) && typeof location === "string" && location.length > 0;
    if (!isRedirect) return { ...result, redirects: redirect };
    if (redirect === MAX_REDIRECTS) throw new ScanTargetError("TOO_MANY_REDIRECTS");

    try {
      current = validateRedirectUrl(new URL(location, current));
    } catch (error) {
      if (error instanceof ScanTargetError) throw error;
      throw new ScanTargetError("INVALID_REDIRECT");
    }
  }

  throw new ScanTargetError("TOO_MANY_REDIRECTS");
}
