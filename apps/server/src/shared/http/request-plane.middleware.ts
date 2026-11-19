import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  AUTH_COOKIE_NAME_DEFAULT,
  AUTH_COOKIE_NAME_LEGACY,
} from './auth-cookie.util';
import { STAFF_AUTH_COOKIE_NAME_DEFAULT } from './staff-auth-cookie.util';

export type RequestPlane = 'public' | 'customer' | 'staff' | 'unknown';

type PlaneConfig = {
  enabled: boolean;
  publicOrigin?: string;
  customerOrigin?: string;
  staffOrigin?: string;
  customerCookieName: string;
  staffCookieName: string;
};

function parseEnabled(value: string | undefined, isProduction: boolean) {
  if (!value) return isProduction;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function safeOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function requestPlaneConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PlaneConfig {
  return {
    enabled: parseEnabled(
      env.HOST_PLANE_ENFORCEMENT,
      (env.NODE_ENV ?? 'development') === 'production',
    ),
    publicOrigin: safeOrigin(env.PUBLIC_SITE_URL),
    customerOrigin: safeOrigin(env.CUSTOMER_APP_URL ?? env.FRONTEND_URL),
    staffOrigin: safeOrigin(env.STAFF_APP_URL),
    customerCookieName:
      env.AUTH_COOKIE_NAME?.trim() || AUTH_COOKIE_NAME_DEFAULT,
    staffCookieName:
      env.STAFF_AUTH_COOKIE_NAME?.trim() || STAFF_AUTH_COOKIE_NAME_DEFAULT,
  };
}

function requestHostname(request: Request): string {
  const forwarded = request.headers['x-forwarded-host'];
  const raw =
    (typeof forwarded === 'string' ? forwarded.split(',')[0] : undefined) ??
    request.headers.host ??
    '';
  return raw.trim().toLowerCase().replace(/:\d+$/, '');
}

function hostnameOf(origin?: string): string | undefined {
  return origin ? new URL(origin).hostname.toLowerCase() : undefined;
}

export function resolveRequestPlane(
  request: Request,
  config: PlaneConfig,
): RequestPlane {
  const hostname = requestHostname(request);
  if (hostname && hostname === hostnameOf(config.publicOrigin)) return 'public';
  if (hostname && hostname === hostnameOf(config.customerOrigin)) {
    return 'customer';
  }
  if (hostname && hostname === hostnameOf(config.staffOrigin)) return 'staff';
  return 'unknown';
}

function isHealthPath(path: string): boolean {
  return /^\/health(?:\/live|\/ready)?\/?$/.test(path);
}

function isCustomerImpersonationExchange(
  method: string,
  path: string,
): boolean {
  return method === 'POST' && path === '/staff/impersonation/exchange';
}

function planeAllows(
  plane: RequestPlane,
  method: string,
  path: string,
): boolean {
  if (isHealthPath(path)) return true;
  if (plane === 'public') return false;
  if (plane === 'customer') {
    return (
      !path.startsWith('/staff') ||
      isCustomerImpersonationExchange(method, path)
    );
  }
  if (plane === 'staff') {
    return path.startsWith('/staff') || path.startsWith('/api');
  }
  return false;
}

function reject(
  response: Response,
  status: number,
  code: string,
  message: string,
): void {
  response.status(status).json({ statusCode: status, code, message });
}

export function createRequestPlaneMiddleware(
  config: PlaneConfig,
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!config.enabled) return next();
    const plane = resolveRequestPlane(request, config);
    if (planeAllows(plane, request.method.toUpperCase(), request.path)) {
      return next();
    }
    reject(
      response,
      plane === 'unknown' ? 421 : 404,
      'REQUEST_PLANE_MISMATCH',
      "Cette API n'est pas disponible sur ce domaine",
    );
  };
}

function cookieHeaderHas(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(';')
    .some((pair) => pair.trim().startsWith(`${name}=`));
}

export function createCsrfOriginMiddleware(
  config: PlaneConfig,
): RequestHandler {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  return (request: Request, response: Response, next: NextFunction) => {
    if (!config.enabled || safeMethods.has(request.method.toUpperCase())) {
      return next();
    }
    if (
      request.path.startsWith('/webhooks/incoming/') ||
      request.path === '/billing/webhook'
    ) {
      return next();
    }

    const cookieHeader = request.headers.cookie;
    const hasSessionCookie =
      cookieHeaderHas(cookieHeader, config.customerCookieName) ||
      cookieHeaderHas(cookieHeader, AUTH_COOKIE_NAME_LEGACY) ||
      cookieHeaderHas(cookieHeader, config.staffCookieName);
    if (!hasSessionCookie) return next();

    const plane = resolveRequestPlane(request, config);
    const expectedOrigin =
      plane === 'customer'
        ? config.customerOrigin
        : plane === 'staff'
          ? config.staffOrigin
          : undefined;
    const origin = request.headers.origin;
    if (!expectedOrigin || origin !== expectedOrigin) {
      reject(
        response,
        403,
        'CSRF_ORIGIN_REJECTED',
        "L'origine de la requête ne correspond pas au domaine de session",
      );
      return;
    }
    next();
  };
}
