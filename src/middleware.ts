import { NextRequest, NextResponse } from "next/server";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  return response;
}

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    request.nextUrl.pathname !== "/api/webhooks/asaas" &&
    UNSAFE_METHODS.has(request.method)
  ) {
    const origin = request.headers.get("origin");
    if (origin && !originAllowed(request, origin)) {
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
