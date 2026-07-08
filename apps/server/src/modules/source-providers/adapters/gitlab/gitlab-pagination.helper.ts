import { BadRequestException } from '@nestjs/common';

export function parsePageFromLinkHeader(
  linkHeader: string | null,
  rel: string,
): number | null {
  if (!linkHeader) return null;

  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="([^"]+)"/);
    if (match && match[2] === rel) {
      const page = Number(match[1]);
      return Number.isFinite(page) ? page : null;
    }
  }
  return null;
}

export function parseNullableHeaderInt(value: unknown): number | null {
  const raw: unknown = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function throwGitlabRequestError(action: string, error: unknown): never {
  const err = error as {
    message?: string;
    response?: { status?: number; data?: unknown };
  };

  const status = err.response?.status;
  const data = err.response?.data;

  let details = '';
  const looksLikeHtml =
    typeof data === 'string' && /<(?:!doctype|html|head|body)\b/i.test(data);

  if (typeof data === 'string') {
    details = looksLikeHtml
      ? 'Réponse HTML inattendue (URL API incorrecte ou page Cloudflare).'
      : data;
  } else if (data && typeof data === 'object') {
    const payload = data as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string') {
      details = payload.message;
    } else if (Array.isArray(payload.message)) {
      details = payload.message
        .filter((item): item is string => typeof item === 'string')
        .join(', ');
    } else if (typeof payload.error === 'string') {
      details = payload.error;
    }
  }

  const parts = [
    status ? `HTTP ${String(status)}` : null,
    details || err.message || null,
  ].filter((value): value is string => Boolean(value));

  const baseMessage =
    parts.length > 0
      ? `GitLab: ${action} échoué (${parts.join(' - ')})`
      : `GitLab: ${action} échoué`;

  const hint =
    status === 401
      ? ' — Token invalide ou manquant. Vérifiez votre Admin Token ou Personal Access Token (scopes: api ou read_api).'
      : status === 403
        ? ' — Accès refusé. Le token ne possède pas les permissions nécessaires sur ce projet/groupe.'
        : status === 404
          ? " — Projet/groupe introuvable. Vérifiez l'ID et les permissions du token."
          : '';

  const htmlHint = looksLikeHtml
    ? " — Utilisez l'URL GitLab base (ex: https://gitlab.com), l'API /api/v4 est ajoutée automatiquement."
    : '';

  throw new BadRequestException(baseMessage + hint + htmlHint);
}
