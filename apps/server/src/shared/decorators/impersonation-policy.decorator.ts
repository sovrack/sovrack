import { SetMetadata } from '@nestjs/common';

export const IMPERSONATION_WRITE_ALLOWED_KEY =
  'sovrack:impersonation-write-allowed';
export const IMPERSONATION_FORBIDDEN_KEY = 'sovrack:impersonation-forbidden';

/** Allows one explicitly reviewed write operation during read-only support. */
export const ImpersonationWriteAllowed = () =>
  SetMetadata(IMPERSONATION_WRITE_ALLOWED_KEY, true);

/** Blocks a route even when its HTTP method is normally read-only. */
export const ImpersonationForbidden = () =>
  SetMetadata(IMPERSONATION_FORBIDDEN_KEY, true);
