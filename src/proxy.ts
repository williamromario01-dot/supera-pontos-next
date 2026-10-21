import { NextRequest, NextResponse } from "next/server";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LEGACY_HOST = "superapontos.gfars.com.br";
const OFFICIAL_HOST = "superpontos.gfars.com.br";
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
].join("; ");

function originAllowed(request: NextRequest, origin: string): boolean {
  try {
    const originUrl = new URL(origin);
    if (originUrl.origin === request.nextUrl.origin) return true;
    const appUrl = process.env.APP_URL;
    return Boolean(appUrl && originUrl.origin === new URL(appUrl).origin);
  } catch {
    return false;
  }
}

function addSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  return response;
}

export function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  const host = (forwardedHost || request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (host === LEGACY_HOST) {
    const destination = request.nextUrl.clone();
    destination.protocol = "https:";
    destination.host = OFFICIAL_HOST;
    return addSecurityHeaders(NextResponse.redirect(destination, 308));
  }
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    request.nextUrl.pathname !== "/api/webhooks/asaas" &&
    UNSAFE_METHODS.has(request.method)
  ) {
    const origin = request.headers.get("origin");
    const cookieAuthenticated = Boolean(request.cookies.get("supera_session")?.value);
    if ((origin && !originAllowed(request, origin)) || (!origin && cookieAuthenticated)) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Origem nao autorizada." }, { status: 403 }),
      );
    }
  }
  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
