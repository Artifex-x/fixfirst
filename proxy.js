import { NextResponse } from "next/server";
import { applySiteSecurityHeaders } from "./lib/security-headers.js";

export function proxy() {
  const response = NextResponse.next();
  applySiteSecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|mark.svg).*)"],
};
