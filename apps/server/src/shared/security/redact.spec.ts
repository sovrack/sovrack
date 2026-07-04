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

  // Mission docker_tls (T4): PEM material must never survive into logs —
  // covers multi-line PEMs, JSON-escaped single-line dumps (Ansible variable
  // dumps escape newlines as \n), and truncated blocks missing the END marker.
  describe('PEM material (docker_tls)', () => {
    it('redacts a multi-line RSA private key block', () => {
      const pem =
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\nAAAA\n-----END RSA PRIVATE KEY-----';
      expect(redactSecrets(`error dump: ${pem} end`)).toBe(
        'error dump: [redacted-private-key] end',
      );
    });

    it('redacts a JSON-escaped single-line private key (Ansible var dump)', () => {
      const line =
        '"content": "-----BEGIN PRIVATE KEY-----\\nMIIEvQ\\n-----END PRIVATE KEY-----\\n"';
      const out = redactSecrets(line);
      expect(out).not.toContain('MIIEvQ');
      expect(out).toContain('[redacted-private-key]');
    });

    it('redacts a TRUNCATED private key (no END marker) to end-of-string', () => {
      const out = redactSecrets(
        'fatal: -----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIB…cut',
      );
      expect(out).not.toContain('MHcCAQEEIB');
      expect(out).toContain('[redacted-private-key]');
    });

    it('redacts certificate blocks too', () => {
      const pem =
        '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----';
      expect(redactSecrets(`ca: ${pem}`)).toBe('ca: [redacted-certificate]');
    });
  });
});
