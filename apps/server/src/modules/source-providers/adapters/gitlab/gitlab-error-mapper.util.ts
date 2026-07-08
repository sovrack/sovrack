import { Logger } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

const logger = new Logger('GitlabErrorMapper');

// ─── Error extraction ───────────────────────────────────────────────────────

export function extractHttpStatus(err: unknown): number | null {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (e.response && typeof e.response === 'object') {
      const resp = e.response as Record<string, unknown>;
      if (typeof resp.status === 'number') return resp.status;
    }
    if (typeof e.status === 'number') return e.status;
  }
  return null;
}

function extractErrorBody(err: unknown): unknown {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (e.response && typeof e.response === 'object') {
      const resp = e.response as Record<string, unknown>;
      if ('data' in resp) return resp.data;
    }
  }
  return null;
}

export function extractGitlabErrorMessage(err: unknown): string {
  return parseGitlabError(extractErrorBody(err));
}

function parseGitlabError(body: unknown): string {
  if (typeof body === 'string') return body.slice(0, 300);
  if (Array.isArray(body))
    return body.filter((i): i is string => typeof i === 'string').join(', ');
  if (body && typeof body === 'object') {
    const p = body as Record<string, unknown>;
    if (typeof p.message === 'string' && p.message.trim()) return p.message;
    if (Array.isArray(p.message))
      return (p.message as unknown[])
        .filter((i): i is string => typeof i === 'string')
        .join(', ');
    if (typeof p.error === 'string' && p.error.trim()) return p.error;
  }
  return 'Erreur GitLab inconnue.';
}

// ─── Mapped exceptions ──────────────────────────────────────────────────────

export function throwGitlabMappedError(
  action: string,
  error: unknown,
  fallback: string,
): never {
  const status = extractHttpStatus(error);
  const body = extractErrorBody(error);
  const msg = parseGitlabError(body);
  logger.error(
    `[GitLab] ${action} failed (status=${String(status)}): ${JSON.stringify(body)}`,
  );
  if (status === 401)
    throw new UnauthorizedException('Token GitLab invalide ou expiré.');
  if (status === 403)
    throw new ForbiddenException(
      'Permission refusée par GitLab. Vérifiez les droits du token.',
    );
  if (status === 404)
    throw new NotFoundException(msg || `${fallback} (ressource introuvable).`);
  if (status === 409)
    throw new ConflictException(msg || `${fallback} (conflit GitLab).`);
  if (status === 422) {
    if (msg.toLowerCase().includes('invalid url'))
      throw new UnprocessableEntityException(
        `${fallback} GitLab a refusé l'URL.`,
      );
    throw new UnprocessableEntityException(
      msg || `${fallback} (payload invalide).`,
    );
  }
  throw new BadRequestException(msg || `${fallback} (erreur inattendue).`);
}

// ─── Retry / alternate strategy ──────────────────────────────────────────────

export function shouldTryAlternate(
  err: unknown,
  action: 'create' | 'update',
): boolean {
  const status = extractHttpStatus(err);
  const msg = extractGitlabErrorMessage(err).toLowerCase();
  if (action === 'create')
    return (
      status === 409 ||
      msg.includes('already exists') ||
      msg.includes('has already been taken')
    );
  return (
    status === 404 ||
    msg.includes('does not exist') ||
    msg.includes('not found')
  );
}

// ─── Object helpers ──────────────────────────────────────────────────────────

export function pickString(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function pickNestedNumber(
  obj: Record<string, unknown>,
  [first, second]: [string, string],
): number | null {
  const l1 = obj[first];
  if (!l1 || typeof l1 !== 'object') return null;
  const v = (l1 as Record<string, unknown>)[second];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
