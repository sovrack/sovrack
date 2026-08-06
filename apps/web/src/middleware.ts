import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE_NAME = "deploy_automation_token";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/pricing",
  "/docs",
  "/legal",
  "/super_admin/login",
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

function parseJwtPayload(token: string): { role?: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const decoded = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(decoded) as { role?: string };
  } catch {
    return null;
  }
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

  // Back-office : réservé au rôle SUPER_ADMIN.
  if (pathname.startsWith("/super_admin") && pathname !== "/super_admin/login") {
    const payload = token ? parseJwtPayload(token) : null;
    const isSuperAdmin = payload?.role === "SUPER_ADMIN";

    if (!token || !isSuperAdmin) {
      return NextResponse.redirect(new URL("/super_admin/login", request.url));
    }
    return NextResponse.next();
  }

  // Confinement SUPER_ADMIN : il ne voit QUE les pages de configuration
  // plateforme (+ la page status et audit-logs). Toute autre route applicative
  // est redirigée vers le back-office.
  if (token) {
    const payload = parseJwtPayload(token);
    if (payload?.role === "SUPER_ADMIN") {
      const allowedAppPaths = [
        "/settings",
        "/settings/audit-logs",
        "/dashboard",
      ];
      const isAllowedAppPath = allowedAppPaths.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
      );
      const isBackOffice = pathname.startsWith("/super_admin");
      const isPublic = isPublicPath(pathname);
      if (!isBackOffice && !isAllowedAppPath && !isPublic) {
        return NextResponse.redirect(
          new URL("/super_admin", request.url),
        );
      }
    }
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
