import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route (or controller) as public — i.e. exempt from the GLOBAL
 * JwtAuthGuard. Use sparingly: only for genuinely unauthenticated endpoints
 * (login, health checks, signature-authenticated webhooks, OAuth callbacks).
 *
 * With the guard registered globally (fail-secure), every route requires a
 * valid JWT UNLESS it carries @Public().
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
