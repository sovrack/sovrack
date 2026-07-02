import { Matches } from 'class-validator';

// Shared between domains/dto/create-domain.dto.ts and proxy/dto/proxy-rule.dto.ts
// (CreateProxyRuleDto.domain) — same domain-name format validated in both
// places instead of duplicating the regex/message.
const DOMAIN_NAME_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export function IsDomainName(): PropertyDecorator {
  return Matches(DOMAIN_NAME_PATTERN, { message: 'Domaine invalide' });
}
