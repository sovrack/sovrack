import { BadRequestException } from '@nestjs/common';
import {
  assertSafeOutboundHttpsUrl,
  isPrivateOrLocalHostname,
} from './outbound-url-policy.util';

describe('outbound URL policy', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.2',
    '::1',
    'fd00::1',
    'service.internal',
    'metadata.google.internal',
  ])('recognizes private/local host %s', (host) => {
    expect(isPrivateOrLocalHostname(host)).toBe(true);
  });

  it('normalizes a safe public HTTPS base URL', () => {
    expect(
      assertSafeOutboundHttpsUrl('https://gitlab.example.com/', {
        allowPath: false,
      }),
    ).toBe('https://gitlab.example.com');
  });

  it.each([
    'http://gitlab.example.com',
    'https://user:pass@gitlab.example.com',
    'https://127.0.0.1',
    'https://169.254.169.254/latest/meta-data',
    'https://service.internal',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => assertSafeOutboundHttpsUrl(url)).toThrow(BadRequestException);
  });

  it('restricts service-specific public hosts', () => {
    expect(() =>
      assertSafeOutboundHttpsUrl('https://evil.example/webhook', {
        allowedPublicHosts: ['hooks.slack.com'],
      }),
    ).toThrow(BadRequestException);
  });
});
