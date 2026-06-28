import { resolveGatewayCorsOrigins } from './cors-origins.util';

describe('resolveGatewayCorsOrigins', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('falls back to localhost defaults when no FRONTEND_* env is set', () => {
    delete process.env.FRONTEND_URLS;
    delete process.env.FRONTEND_URL;
    expect(resolveGatewayCorsOrigins()).toEqual([
      'http://localhost:3000',
      'http://localhost:3002',
    ]);
  });

  it('parses a comma-separated FRONTEND_URLS list and trims each entry', () => {
    process.env.FRONTEND_URLS = 'https://a.com, https://b.com ';
    delete process.env.FRONTEND_URL;
    expect(resolveGatewayCorsOrigins()).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('combines FRONTEND_URLS + FRONTEND_URL and deduplicates origins', () => {
    process.env.FRONTEND_URLS = 'https://a.com,https://b.com';
    process.env.FRONTEND_URL = 'https://a.com';
    expect(resolveGatewayCorsOrigins()).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('ignores empty fragments from trailing/double commas', () => {
    process.env.FRONTEND_URLS = 'https://a.com,,';
    delete process.env.FRONTEND_URL;
    expect(resolveGatewayCorsOrigins()).toEqual(['https://a.com']);
  });
});
