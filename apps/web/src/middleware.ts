import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE_NAME = "deploy_automation_token";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/pricing",
  "/docs",
  "/status",
  "/legal",
];

const AUTHENTICATED_REDIRECT = "/dashboard";

const LEGACY_LOGIN_ALIASES = [
  "/auth/login",
  "/auth/login/admin",
  "/auth/login/developer",
  "/login/admin",
  "/login/developer",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function parseJwtExpiration(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    // Buffer.from with 'base64url' handles the URL-safe alphabet (- and _)
    // and is available in all Node.js / Next.js Edge runtimes, unlike atob()
    // which is absent in some Edge environments.
    const decoded = Buffer.from(parts[1], "base64url").toString("utf-8");
    const payload = JSON.parse(decoded) as { exp?: unknown };

    if (typeof payload.exp !== "number") {
      return null;
    }

    return payload.exp;
  } catch {
    return null;
  }
}

function isTokenExpiredOrInvalid(token: string): boolean {
  const exp = parseJwtExpiration(token);
  if (!exp) {
    return true;
  }

  return Date.now() >= exp * 1000;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (LEGACY_LOGIN_ALIASES.includes(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (
    pathname.startsWith("/backend-api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (token && isTokenExpiredOrInvalid(token)) {
    const loginUrl = new URL("/login", request.url);
    if (!isPublicPath(pathname)) {
      loginUrl.searchParams.set("next", pathname);
    }

    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  if (!token && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token && isPublicPath(pathname)) {
    // Les utilisateurs connectés sont renvoyés vers le dashboard depuis les
    // pages marketing (sauf depuis le status/legal qui restent consultables).
    if (
      pathname === "/" ||
      pathname === "/pricing" ||
      pathname === "/login" ||
      pathname === "/register" ||
      LEGACY_LOGIN_ALIASES.includes(pathname)
    ) {
      return NextResponse.redirect(
        new URL(AUTHENTICATED_REDIRECT, request.url),
      );
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)"],
};
