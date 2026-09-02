import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
  ".test",
  ".invalid",
  ".example",
  ".onion",
];

function ipv4ToNumber(address) {
  return address.split(".").reduce((value, part) => (value * 256) + Number(part), 0) >>> 0;
}

function inIpv4Range(address, start, prefix) {
  const value = ipv4ToNumber(address);
  const base = ipv4ToNumber(start);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

export function isUnsafeIpv4(address) {
  if (net.isIP(address) !== 4) return true;

  const blocked = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.31.196.0", 24],
    ["192.52.193.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["192.175.48.0", 24],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];

  return blocked.some(([start, prefix]) => inIpv4Range(address, start, prefix));
}

function expandIpv6(address) {
  const normalized = address.toLowerCase().split("%")[0];
  const [left = "", right = ""] = normalized.split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];

  function convertIpv4(parts) {
    const last = parts.at(-1);
    if (!last?.includes(".")) return parts;
    if (net.isIP(last) !== 4) return [];
    const bytes = last.split(".").map(Number);
    return [...parts.slice(0, -1), ((bytes[0] << 8) | bytes[1]).toString(16), ((bytes[2] << 8) | bytes[3]).toString(16)];
  }

  const safeLeft = convertIpv4(leftParts);
  const safeRight = convertIpv4(rightParts);
  const missing = 8 - safeLeft.length - safeRight.length;
  const parts = normalized.includes("::")
    ? [...safeLeft, ...Array(Math.max(0, missing)).fill("0"), ...safeRight]
    : safeLeft;

  if (parts.length !== 8) return null;
  return parts.map((part) => Number.parseInt(part || "0", 16));
}

export function isUnsafeIpv6(address) {
  if (net.isIP(address) !== 6) return true;
  const parts = expandIpv6(address);
  if (!parts) return true;

  const [first, second, third, fourth, fifth, sixth, seventh, eighth] = parts;
  if (parts.every((part) => part === 0) || (parts.slice(0, 7).every((part) => part === 0) && eighth === 1)) return true;
  if ((first & 0xfe00) === 0xfc00) return true; // Unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // Link local fe80::/10
  if ((first & 0xff00) === 0xff00) return true; // Multicast ff00::/8
  if (first === 0x0064 && second === 0xff9b && third === 1) return true; // Local-use translation 64:ff9b:1::/48
  if (first === 0x0100 && second === 0 && third === 0 && fourth === 0) return true; // Discard-only 100::/64
  if (first === 0x2001 && second <= 0x01ff) return true; // IETF protocol assignments 2001::/23
  if (first === 0x2001 && second === 0x0db8) return true; // Documentation
  if (first === 0x2002) return true; // Deprecated 6to4 2002::/16
  if (first === 0x3fff && (second & 0xf000) === 0) return true; // Documentation 3fff::/20

  const mappedIpv4 = first === 0 && second === 0 && third === 0 && fourth === 0 && fifth === 0 && sixth === 0xffff;
  const compatibleIpv4 = first === 0 && second === 0 && third === 0 && fourth === 0 && fifth === 0 && sixth === 0;
  const wellKnownNat64 = first === 0x0064 && second === 0xff9b && third === 0 && fourth === 0 && fifth === 0 && sixth === 0;
  if (mappedIpv4 || compatibleIpv4 || wellKnownNat64) {
    const ipv4 = `${seventh >> 8}.${seventh & 255}.${eighth >> 8}.${eighth & 255}`;
    return isUnsafeIpv4(ipv4);
  }

  return false;
}

export function isUnsafeAddress(address) {
  const version = net.isIP(address);
  if (version === 4) return isUnsafeIpv4(address);
  if (version === 6) return isUnsafeIpv6(address);
  return true;
}

function parseAndValidateUrl(raw, { stripPath = false } = {}) {
  if (!(raw instanceof URL) && (typeof raw !== "string" || raw.length > 2048)) {
    throw new ScanTargetError("INVALID_URL");
  }

  const input = raw instanceof URL ? raw.toString() : raw.trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let url;

  try {
    url = new URL(withProtocol);
  } catch {
    throw new ScanTargetError("INVALID_URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) throw new ScanTargetError("BLOCKED_TARGET");
  if (url.username || url.password) throw new ScanTargetError("BLOCKED_TARGET");

  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!hostname || hostname.length > 253 || hostname === "localhost") throw new ScanTargetError("BLOCKED_TARGET");
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) throw new ScanTargetError("BLOCKED_TARGET");

  const allowedPort = !url.port || (url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80");
  if (!allowedPort) throw new ScanTargetError("BLOCKED_TARGET");
  if (net.isIP(hostname) && isUnsafeAddress(hostname)) throw new ScanTargetError("BLOCKED_TARGET");

  if (!net.isIP(hostname)) url.hostname = hostname;
  if (stripPath) {
    url.pathname = "/";
    url.search = "";
  }
  url.hash = "";
  return url;
}

export function normalizeUrlInput(raw) {
  return parseAndValidateUrl(raw, { stripPath: true });
}

export function validateRedirectUrl(raw) {
  return parseAndValidateUrl(raw, { stripPath: false });
}

export async function resolveSafeTarget(raw) {
  const url = raw instanceof URL ? validateRedirectUrl(raw) : normalizeUrlInput(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(hostname)) {
    if (isUnsafeAddress(hostname)) throw new ScanTargetError("BLOCKED_TARGET");
    return { url, address: hostname, family: net.isIP(hostname) };
  }

  const [ipv4Result, ipv6Result] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ]);
  const addresses = [
    ...(ipv4Result.status === "fulfilled" ? ipv4Result.value.map((address) => ({ address, family: 4 })) : []),
    ...(ipv6Result.status === "fulfilled" ? ipv6Result.value.map((address) => ({ address, family: 6 })) : []),
  ];

  if (!addresses.length || addresses.some(({ address }) => isUnsafeAddress(address))) {
    if (!addresses.length) throw new ScanTargetError("DNS_FAILED");
    throw new ScanTargetError("BLOCKED_TARGET");
  }

  const selected = addresses.find(({ family }) => family === 4) || addresses[0];
  return { url, address: selected.address, family: selected.family };
}

export class ScanTargetError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "ScanTargetError";
    this.code = code;
  }
}
