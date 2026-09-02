import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { fetchPublicPage, scannerLimits } from "../lib/scanner/http-client.js";

async function withRawServer(handler, exercise) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    let request = Buffer.alloc(0);
    let handled = false;
    socket.on("data", (chunk) => {
      if (handled) return;
      request = Buffer.concat([request, chunk]);
      if (!request.includes("\r\n\r\n")) return;
      handled = true;
      handler(socket, request.toString("latin1"));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const options = {
    connectFactory: () => net.connect({ host: "127.0.0.1", port }),
    resolveTarget: async (url) => ({ url: url instanceof URL ? url : new URL(url), address: "93.184.216.34", family: 4 }),
  };

  try {
    return await exercise(options);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("pins the connection while preserving the original Host and request path", async () => {
  let requestText = "";
  const result = await withRawServer((socket, request) => {
    requestText = request;
    const body = "<html><h1>Public response</h1></html>";
    socket.end(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nSet-Cookie: session=abc; Secure; HttpOnly; SameSite=Lax\r\nConnection: close\r\n\r\n${body}`);
  }, (options) => fetchPublicPage(new URL("http://public-fixture.net/account?temporary=value"), options));

  assert.match(requestText, /^GET \/account\?temporary=value HTTP\/1\.1\r\n/m);
  assert.match(requestText, /\r\nHost: public-fixture\.net\r\n/);
  assert.equal(result.url, "http://public-fixture.net/account");
  assert.equal(result.body, "<html><h1>Public response</h1></html>");
  assert.deepEqual(result.headers["set-cookie"], ["session=abc; Secure; HttpOnly; SameSite=Lax"]);
  assert.equal(result.transport, "pinned_socket");
  assert.equal(result.bodyAnalyzed, true);
});

test("blocks an unsafe redirect before a second connection is resolved", async () => {
  let resolveCalls = 0;
  await assert.rejects(
    () => withRawServer((socket) => {
      socket.end("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/admin\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    }, (options) => fetchPublicPage(new URL("http://public-fixture.net/redirect"), {
      ...options,
      resolveTarget: async (url) => {
        resolveCalls += 1;
        return options.resolveTarget(url);
      },
    })),
    (error) => error?.code === "BLOCKED_TARGET",
  );
  assert.equal(resolveCalls, 1);
});

test("decodes and bounds an oversized chunked HTML response", async () => {
  const source = Buffer.alloc(scannerLimits.maxBodyBytes + 32_768, 65);
  const result = await withRawServer((socket) => {
    socket.write(`HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n${source.length.toString(16)}\r\n`);
    socket.end(Buffer.concat([source, Buffer.from("\r\n0\r\n\r\n")]));
  }, (options) => fetchPublicPage(new URL("http://public-fixture.net/large"), options));

  assert.equal(result.body.length, scannerLimits.maxBodyBytes);
  assert.equal(result.body.startsWith("AAAA"), true);
  assert.equal(result.truncated, true);
});

test("does not inspect a non-HTML response body", async () => {
  const result = await withRawServer((socket) => {
    const body = JSON.stringify({ privateFieldName: "not inspected" });
    socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  }, (options) => fetchPublicPage(new URL("http://public-fixture.net/data"), options));

  assert.equal(result.bodyAnalyzed, false);
  assert.equal(result.body, "");
  assert.equal(result.contentType, "application/json");
});

test("rejects oversized headers and applies one global timeout", async () => {
  await assert.rejects(
    () => withRawServer((socket) => {
      socket.end(`HTTP/1.1 200 OK\r\nX-Large: ${"a".repeat(scannerLimits.maxHeaderBytes + 1)}\r\n\r\n`);
    }, (options) => fetchPublicPage(new URL("http://public-fixture.net/headers"), options)),
    (error) => error?.code === "RESPONSE_HEADERS_TOO_LARGE",
  );

  await assert.rejects(
    () => withRawServer(() => {}, (options) => fetchPublicPage(new URL("http://public-fixture.net/slow"), { ...options, timeoutMs: 40 })),
    (error) => error?.code === "SCAN_TIMEOUT",
  );
});
