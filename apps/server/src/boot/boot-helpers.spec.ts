import {
  assertRequiredEnv,
  assertRequiredTables,
  assertRequiredTablesWithRetry,
  isAllowedCorsOrigin,
  recoverInFlightDeployments,
  reportWebhookConfiguration,
  resolveAllowedOrigins,
} from './boot-helpers';

// ── assertRequiredEnv ─────────────────────────────────────────────────────────

describe('assertRequiredEnv', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((_code) => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    exitSpy.mockRestore();
  });

  it('does not exit when all required env vars are set', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.CONFIG_SECRET = 'a'.repeat(32);
    process.env.JWT_SECRET = 'b'.repeat(32);
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it('exits when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    process.env.CONFIG_SECRET = 'a'.repeat(32);
    process.env.JWT_SECRET = 'b'.repeat(32);
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(() => assertRequiredEnv()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits when CONFIG_SECRET is too short (< 32 chars)', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.CONFIG_SECRET = 'short';
    process.env.JWT_SECRET = 'b'.repeat(32);
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(() => assertRequiredEnv()).toThrow('process.exit called');
  });

  it('exits when JWT_SECRET is too short', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.CONFIG_SECRET = 'a'.repeat(32);
    process.env.JWT_SECRET = 'short';
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(() => assertRequiredEnv()).toThrow('process.exit called');
  });
});

// ── resolveAllowedOrigins ────────────────────────────────────────────────────

describe('resolveAllowedOrigins', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NODE_ENV = 'development';
    delete process.env.FRONTEND_URLS;
    delete process.env.FRONTEND_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('includes localhost origins in development when no env var is set', () => {
    const origins = resolveAllowedOrigins();
    expect(origins).toContain('http://localhost:3000');
  });

  it('includes FRONTEND_URLS origins in development', () => {
    process.env.FRONTEND_URLS = 'https://app.example.com,https://staging.example.com';
    const origins = resolveAllowedOrigins();
    expect(origins).toContain('https://app.example.com');
    expect(origins).toContain('https://staging.example.com');
  });

  it('deduplicates origins', () => {
    process.env.FRONTEND_URLS = 'https://app.example.com';
    process.env.FRONTEND_URL = 'https://app.example.com';
    const origins = resolveAllowedOrigins();
    const count = origins.filter((o) => o === 'https://app.example.com').length;
    expect(count).toBe(1);
  });

  it('throws in production when no FRONTEND_URLS is set', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveAllowedOrigins()).toThrow();
  });
});

// ── isAllowedCorsOrigin ───────────────────────────────────────────────────────

describe('isAllowedCorsOrigin', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('allows an origin explicitly in the allowed set', () => {
    const allowed = new Set(['https://app.example.com']);
    expect(isAllowedCorsOrigin('https://app.example.com', allowed)).toBe(true);
  });

  it('rejects an origin not in the set in production', () => {
    process.env.NODE_ENV = 'production';
    const allowed = new Set(['https://app.example.com']);
    expect(isAllowedCorsOrigin('https://evil.com', allowed)).toBe(false);
  });

  it('allows localhost origins in development even when not in set', () => {
    process.env.NODE_ENV = 'development';
    const allowed = new Set<string>();
    expect(isAllowedCorsOrigin('http://localhost:3001', allowed)).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:8080', allowed)).toBe(true);
  });

  it('rejects non-localhost origins not in set in development', () => {
    process.env.NODE_ENV = 'development';
    const allowed = new Set<string>();
    expect(isAllowedCorsOrigin('https://external.io', allowed)).toBe(false);
  });

  it('rejects invalid URLs gracefully', () => {
    const allowed = new Set<string>();
    expect(isAllowedCorsOrigin('not-a-url', allowed)).toBe(false);
  });
});

// ── reportWebhookConfiguration ────────────────────────────────────────────────

describe('reportWebhookConfiguration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  const logger = { log: jest.fn(), warn: jest.fn() } as never;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('logs disabled message when GITLAB_WEBHOOK_AUTO_CONFIGURE=false', () => {
    process.env.GITLAB_WEBHOOK_AUTO_CONFIGURE = 'false';
    delete process.env.WEBHOOK_URL;
    reportWebhookConfiguration(logger);
    expect(logger.log).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns when WEBHOOK_URL is not set', () => {
    delete process.env.GITLAB_WEBHOOK_AUTO_CONFIGURE;
    delete process.env.WEBHOOK_URL;
    reportWebhookConfiguration(logger);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('warns when WEBHOOK_URL has an invalid scheme', () => {
    delete process.env.GITLAB_WEBHOOK_AUTO_CONFIGURE;
    process.env.WEBHOOK_URL = 'ftp://not-http.example.com';
    reportWebhookConfiguration(logger);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unsupported scheme'),
      'Bootstrap',
    );
  });

  it('warns when WEBHOOK_URL is not an absolute URL', () => {
    delete process.env.GITLAB_WEBHOOK_AUTO_CONFIGURE;
    process.env.WEBHOOK_URL = 'not-a-url';
    reportWebhookConfiguration(logger);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('expected absolute URL'),
      'Bootstrap',
    );
  });

  it('does not warn when WEBHOOK_URL is valid', () => {
    delete process.env.GITLAB_WEBHOOK_AUTO_CONFIGURE;
    process.env.WEBHOOK_URL = 'https://platform.example.com';
    reportWebhookConfiguration(logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

// ── assertRequiredTables ──────────────────────────────────────────────────────

describe('assertRequiredTables', () => {
  it('resolves when all required tables exist', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { table_name: 'SshKey' },
        { table_name: 'GitProviderConfig' },
        { table_name: 'other' },
      ]),
    } as never;
    await expect(assertRequiredTables(prisma)).resolves.toBeUndefined();
  });

  it('throws when a required table is missing', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ table_name: 'SshKey' }]),
    } as never;
    await expect(assertRequiredTables(prisma)).rejects.toThrow(
      'GitProviderConfig',
    );
  });
});

// ── assertRequiredTablesWithRetry ─────────────────────────────────────────────

describe('assertRequiredTablesWithRetry', () => {
  it('resolves on first attempt when tables exist', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { table_name: 'SshKey' },
        { table_name: 'GitProviderConfig' },
      ]),
    } as never;
    await expect(
      assertRequiredTablesWithRetry(prisma, 3, 1),
    ).resolves.toBeUndefined();
  });

  it('retries and succeeds on third attempt', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([]) // missing tables
        .mockResolvedValueOnce([]) // missing tables
        .mockResolvedValue([
          { table_name: 'SshKey' },
          { table_name: 'GitProviderConfig' },
        ]),
    } as never;
    await expect(
      assertRequiredTablesWithRetry(prisma, 3, 1),
    ).resolves.toBeUndefined();
  });

  it('throws after exhausting all retries', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ table_name: 'SshKey' }]),
    } as never;
    await expect(
      assertRequiredTablesWithRetry(prisma, 2, 1),
    ).rejects.toThrow('GitProviderConfig');
  });
});

// ── recoverInFlightDeployments ────────────────────────────────────────────────

describe('recoverInFlightDeployments', () => {
  it('calls recoverInFlightDeploymentsAfterRestart and logs when count > 0', async () => {
    const logger = { warn: jest.fn(), log: jest.fn() } as never;
    const lifecycleService = {
      recoverInFlightDeploymentsAfterRestart: jest.fn().mockResolvedValue(2),
    };
    const app = { get: jest.fn().mockReturnValue(lifecycleService) } as never;
    await recoverInFlightDeployments(app, logger);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('2'),
      'Bootstrap',
    );
  });

  it('does not warn when no deployments are recovered', async () => {
    const logger = { warn: jest.fn(), log: jest.fn() } as never;
    const lifecycleService = {
      recoverInFlightDeploymentsAfterRestart: jest.fn().mockResolvedValue(0),
    };
    const app = { get: jest.fn().mockReturnValue(lifecycleService) } as never;
    await recoverInFlightDeployments(app, logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('swallows errors during recovery (non-critical)', async () => {
    const logger = { warn: jest.fn(), log: jest.fn() } as never;
    const app = {
      get: jest.fn().mockImplementation(() => {
        throw new Error('service not found');
      }),
    } as never;
    await expect(recoverInFlightDeployments(app, logger)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('service not found'),
      'Bootstrap',
    );
  });
});
