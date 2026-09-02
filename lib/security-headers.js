export const SITE_SECURITY_HEADERS = Object.freeze([
  Object.freeze({ key: "X-Content-Type-Options", value: "nosniff" }),
  Object.freeze({ key: "Strict-Transport-Security", value: "max-age=31536000" }),
  Object.freeze({ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }),
  Object.freeze({ key: "X-Frame-Options", value: "DENY" }),
  Object.freeze({ key: "X-DNS-Prefetch-Control", value: "off" }),
  Object.freeze({ key: "Cross-Origin-Opener-Policy", value: "same-origin" }),
  Object.freeze({ key: "Cross-Origin-Resource-Policy", value: "same-origin" }),
  Object.freeze({ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" }),
  Object.freeze({
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
  }),
]);

export function applySiteSecurityHeaders(headers) {
  for (const { key, value } of SITE_SECURITY_HEADERS) {
    headers.set(key, value);
  }
  return headers;
}
