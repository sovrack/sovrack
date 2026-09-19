import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';

type OutboundUrlOptions = {
  label?: string;
  allowPath?: boolean;
  allowedPublicHosts?: readonly string[];
};

function privateHostAllowlist(): Set<string> {
  return new Set(
    (process.env.OUTBOUND_PRIVATE_HOST_ALLOWLIST ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '::' || host === '::1') return true;
  if (host.startsWith('fc') || host.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(host)) return true;
  if (host.startsWith('::ffff:')) {
    return isPrivateIpv4(host.slice('::ffff:'.length));
  }
  return false;
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  const ipVersion = isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host);
  if (ipVersion === 6) return isPrivateIpv6(host);
  return false;
}

/**
 * Validates every user-controlled URL that the backend may contact.
 * Private/self-hosted destinations require an explicit exact-host allowlist.
 * Network egress rules remain the second line of defence against DNS rebinding.
 */
export function assertSafeOutboundHttpsUrl(
  raw: string,
  options: OutboundUrlOptions = {},
): string {
  const label = options.label ?? 'URL';
  let parsed: URL;
  try {
    parsed = new URL(
      options.allowPath === false ? raw.trim().replace(/\/+$/, '') : raw.trim(),
    );
  } catch {
    throw new BadRequestException(`${label} invalide`);
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException(`${label} doit utiliser HTTPS`);
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestException(
      `${label} ne doit pas contenir d'identifiants`,
    );
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) throw new BadRequestException(`${label} sans hôte`);

  const allowedPrivateHosts = privateHostAllowlist();
  if (
    isPrivateOrLocalHostname(hostname) &&
    !allowedPrivateHosts.has(hostname)
  ) {
    throw new BadRequestException(
      `${label} cible un réseau privé ou local non autorisé`,
    );
  }

  const allowedPublicHosts = options.allowedPublicHosts?.map((host) =>
    host.toLowerCase(),
  );
  if (allowedPublicHosts && !allowedPublicHosts.includes(hostname)) {
    throw new BadRequestException(`${label} utilise un hôte non autorisé`);
  }
  if (
    options.allowPath === false &&
    (parsed.pathname !== '/' || parsed.search || parsed.hash)
  ) {
    throw new BadRequestException(`${label} doit être une URL de base`);
  }

  return options.allowPath === false
    ? parsed.origin
    : parsed.toString().replace(/\/$/, '');
}
