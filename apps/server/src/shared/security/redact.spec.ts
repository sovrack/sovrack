import { redactSecrets } from './redact';

describe('redactSecrets', () => {
  it('redacts --private-key values (path or material)', () => {
    expect(redactSecrets('ssh --private-key /tmp/ssh_key -u root')).toBe(
      'ssh --private-key [redacted] -u root',
    );
  });

  it('redacts GitLab Runner registration-token', () => {
    expect(
      redactSecrets('gitlab-runner register registration-token GR123abc'),
    ).toBe('gitlab-runner register registration-token [redacted]');
  });

  it('redacts env-style token / password / secret / api_key assignments', () => {
    expect(redactSecrets('token=abc123')).toBe('token=[redacted]');
    expect(redactSecrets('password=hunter2')).toBe('password=[redacted]');
    expect(redactSecrets('secret=s3cr3t')).toBe('secret=[redacted]');
    expect(redactSecrets('api_key=KEY')).toBe('api_key=[redacted]');
    expect(redactSecrets('apikey=KEY')).toBe('apikey=[redacted]');
    expect(redactSecrets('API-KEY=KEY')).toBe('API-KEY=[redacted]');
  });

  it('redacts Bearer tokens and Authorization headers', () => {
    expect(redactSecrets('Authorization: Bearer eyJhbGciOi')).toBe(
      'Authorization: [redacted]',
    );
    expect(redactSecrets('header bearer abc.def.ghi')).toBe(
      'header bearer [redacted]',
    );
  });

  it('is case-insensitive', () => {
    expect(redactSecrets('TOKEN=abc')).toBe('TOKEN=[redacted]');
  });

  it('redacts every occurrence (global)', () => {
    expect(redactSecrets('token=a token=b')).toBe(
      'token=[redacted] token=[redacted]',
    );
  });

  it('leaves non-secret text untouched', () => {
    const safe = 'Deploying app to server 10.0.0.1 on port 3000';
    expect(redactSecrets(safe)).toBe(safe);
  });
});
