import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE_NAME = "sovrack_token";
const AUTH_COOKIE_NAME_LEGACY = "deploy_automation_token";
const STAFF_COOKIE_NAME = "sovrack_staff_token";
const STAFF_COOKIE_NAME_LEGACY = "deploy_staff_token";

const PUBLIC_MARKETING_PATHS = [
  "/",
  "/pricing",
  "/docs",
  "/status",
  "/security",
  "/legal",
  "/privacy",
  "/terms",
  "/cookies",
  "/acceptable-use",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
];

const CLIENT_PUBLIC_PATHS = [
  ...PUBLIC_MARKETING_PATHS,
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/invitations/accept",
  "/staff-session-exchange",
];

const STAFF_PUBLIC_PATHS = [
  "/staff/login",
  "/staff/activate",
  "/staff/forgot-password",
  "/staff/reset-password",
];

const AUTHENTICATED_REDIRECT = "/dashboard";

const LEGACY_LOGIN_ALIASES = [
  "/auth/login",
  "/auth/login/admin",
  "/auth/login/developer",
  "/login/admin",
  "/login/developer",
];

function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isStaffPath(pathname: string): boolean {
  return pathname === "/staff" || pathname.startsWith("/staff/");
}

function configuredOrigin(
  serverValue: string | undefined,
  publicValue: string | undefined,
): string {
  return (serverValue?.trim() || publicValue?.trim() || "").replace(/\/+$/, "");
}

function hostname(origin: string): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function requestHostname(request: NextRequest): string {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host =
    forwardedHost || request.headers.get("host") || request.nextUrl.host;

  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return request.nextUrl.hostname.toLowerCase();
  }
}

function redirectTo(
  origin: string,
  pathname: string,
  request: NextRequest,
  preserveSearch = true,
) {
  const target = new URL(pathname, `${origin}/`);
  if (preserveSearch) target.search = request.nextUrl.search;
  return NextResponse.redirect(target);
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
  const token =
    request.cookies.get(AUTH_COOKIE_NAME)?.value ||
    request.cookies.get(AUTH_COOKIE_NAME_LEGACY)?.value;
  const staffToken =
    request.cookies.get(STAFF_COOKIE_NAME)?.value ||
    request.cookies.get(STAFF_COOKIE_NAME_LEGACY)?.value;

  const publicOrigin = configuredOrigin(
    process.env.PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL,
  );
  const customerOrigin = configuredOrigin(
    process.env.CUSTOMER_APP_URL,
    process.env.NEXT_PUBLIC_CUSTOMER_APP_URL,
  );
  const staffOrigin = configuredOrigin(
    process.env.STAFF_APP_URL,
    process.env.NEXT_PUBLIC_STAFF_APP_URL,
  );
  const publicHost = hostname(publicOrigin);
  const customerHost = hostname(customerOrigin);
  const staffHost = hostname(staffOrigin);
  const currentHost = requestHostname(request);
  const splitPlanesEnabled =
    Boolean(publicHost && customerHost && staffHost) &&
    new Set([publicHost, customerHost, staffHost]).size === 3;

  if (LEGACY_LOGIN_ALIASES.includes(pathname)) {
    return redirectTo(
      customerOrigin || request.nextUrl.origin,
      "/login",
      request,
    );
  }

  if (
    pathname.startsWith("/backend-api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (splitPlanesEnabled) {
    if (currentHost === publicHost) {
      if (isStaffPath(pathname)) {
        return redirectTo(staffOrigin, pathname, request);
      }
      if (!matchesPath(pathname, PUBLIC_MARKETING_PATHS)) {
        return redirectTo(customerOrigin, pathname, request);
      }
      return NextResponse.next();
    }

    if (currentHost === customerHost) {
      if (isStaffPath(pathname)) {
        return redirectTo(staffOrigin, pathname, request);
      }
      if (pathname === "/") {
        return redirectTo(
          customerOrigin,
          token && !isTokenExpiredOrInvalid(token) ? "/dashboard" : "/login",
          request,
          false,
        );
      }
      if (matchesPath(pathname, PUBLIC_MARKETING_PATHS)) {
        return redirectTo(publicOrigin, pathname, request);
      }
    }

    if (currentHost === staffHost && !isStaffPath(pathname)) {
      return redirectTo(staffOrigin, "/staff", request, false);
    }
  }

  // Back-office : protégé par une session et un domaine dédiés.
  if (isStaffPath(pathname)) {
    if (matchesPath(pathname, STAFF_PUBLIC_PATHS)) {
      return NextResponse.next();
    }
    if (!staffToken || isTokenExpiredOrInvalid(staffToken)) {
      const response = redirectTo(
        staffOrigin || request.nextUrl.origin,
        "/staff/login",
        request,
        false,
      );
      if (staffToken) {
        response.cookies.delete(STAFF_COOKIE_NAME);
        response.cookies.delete(STAFF_COOKIE_NAME_LEGACY);
      }
      return response;
    }
    return NextResponse.next();
  }

  if (token && isTokenExpiredOrInvalid(token)) {
    const loginUrl = new URL("/login", request.url);
    if (!matchesPath(pathname, CLIENT_PUBLIC_PATHS)) {
      loginUrl.searchParams.set("next", pathname);
    }

    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(AUTH_COOKIE_NAME);
    response.cookies.delete(AUTH_COOKIE_NAME_LEGACY);
    return response;
  }

  if (!token && !matchesPath(pathname, CLIENT_PUBLIC_PATHS)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token && matchesPath(pathname, CLIENT_PUBLIC_PATHS)) {
    // Le site public reste consultable après connexion. Seules les pages
    // d'authentification n'ont plus de sens avec une session client active.
    if (
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
