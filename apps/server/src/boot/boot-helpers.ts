/**
 * B-16 fix: Boot helpers extracted from main.ts to keep bootstrap() readable.
 * Each helper has a single responsibility and is fully testable in isolation.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { LoggerService } from '../shared/logger/logger.service';
import { DeploymentsLifecycleService } from '../modules/deployments/core/deployments-lifecycle.service';

type RequiredEnv = {
  name: string;
  hint: string;
  validate?: (value: string) => string | null;
};

const REQUIRED_ENV: RequiredEnv[] = [
  { name: 'DATABASE_URL', hint: 'PostgreSQL connection string' },
  {
    name: 'CONFIG_SECRET',
    hint: 'AES encryption key (min 32 chars)',
    validate: (v) => (v.length < 32 ? 'too short (min 32 chars)' : null),
  },
  {
    name: 'JWT_SECRET',
    hint: 'JWT signing secret (min 32 chars)',
    validate: (v) => (v.length < 32 ? 'too short (min 32 chars)' : null),
  },
  { name: 'REDIS_URL', hint: 'Redis connection URL (required by BullMQ)' },
];

/**
 * Fail fast BEFORE NestFactory.create() so the operator gets the COMPLETE list
 * of missing/invalid env vars in one shot.
 */
export function assertRequiredEnv(): void {
  const problems: string[] = [];
  for (const { name, hint, validate } of REQUIRED_ENV) {
    const value = process.env[name]?.trim();
    if (!value) {
      problems.push(`${name.padEnd(22)}-> ${hint}`);
      continue;
    }
    const invalid = validate?.(value);
    if (invalid) {
      problems.push(`${name.padEnd(22)}-> ${hint} (${invalid})`);
    }
  }

  if (problems.length > 0) {
    const message = [
      '[BOOT] Missing or invalid required environment variables:',
      ...problems.map((line) => `  - ${line}`),
      'Fix your .env file and restart.',
    ].join('\n');
    console.error(message);
    process.exit(1);
  }
}

export function resolveAllowedOrigins(): string[] {
  const envOrigins = [
    process.env.FRONTEND_URLS ?? '',
    process.env.FRONTEND_URL ?? '',
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const localDevOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];

  if ((process.env.NODE_ENV ?? 'development') !== 'production') {
    return Array.from(new Set([...envOrigins, ...localDevOrigins]));
  }

  if (envOrigins.length > 0) {
    return Array.from(new Set(envOrigins));
  }

  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    throw new Error(
      'FRONTEND_URLS is empty in production. Set at least one allowed origin.',
    );
  }

  return localDevOrigins;
}

export function isAllowedCorsOrigin(
  origin: string,
  allowedOrigins: Set<string>,
): boolean {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    return false;
  }

  try {
    const parsed = new URL(origin);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const isLocalHost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    return isHttp && isLocalHost;
  } catch {
    return false;
  }
}

export function reportWebhookConfiguration(logger: LoggerService): void {
  const autoConfigureWebhook = !['0', 'false', 'no', 'off'].includes(
    process.env.GITLAB_WEBHOOK_AUTO_CONFIGURE?.trim().toLowerCase() ?? 'true',
  );

  if (!autoConfigureWebhook) {
    logger.log(
      'GITLAB_WEBHOOK_AUTO_CONFIGURE=false: automatic webhook configuration is disabled.',
      'Bootstrap',
    );
    return;
  }

  const rawWebhookUrl = (process.env.WEBHOOK_URL ?? '').trim();
  if (!rawWebhookUrl) {
    logger.warn(
      'WEBHOOK_URL not set. Webhooks will use PlatformConfig.WEBHOOK_BASE_URL (configurable in Settings UI).',
      'Bootstrap',
    );
    return;
  }

  try {
    const parsed = new URL(rawWebhookUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      logger.warn(
        `WEBHOOK_URL invalid (unsupported scheme): ${rawWebhookUrl}`,
        'Bootstrap',
      );
      return;
    }
  } catch {
    logger.warn(
      `WEBHOOK_URL invalid (expected absolute URL): ${rawWebhookUrl}`,
      'Bootstrap',
    );
  }
}

export async function recoverInFlightDeployments(
  app: INestApplication,
  logger: LoggerService,
): Promise<void> {
  try {
    const lifecycleService = app.get(DeploymentsLifecycleService);
    const recovered =
      await lifecycleService.recoverInFlightDeploymentsAfterRestart();

    if (recovered > 0) {
      logger.warn(
        `Startup recovery: ${String(recovered)} in-flight deployment(s) marked as FAILED.`,
        'Bootstrap',
      );
    }
  } catch (error) {
    logger.warn(
      `Startup recovery skipped: ${error instanceof Error ? error.message : 'unknown error'}`,
      'Bootstrap',
    );
  }
}

export async function assertRequiredTables(
  prisma: PrismaService,
): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `;

  const existingTables = new Set(rows.map((row) => row.table_name));
  const requiredTables = ['SshKey', 'GitProviderConfig'];
  const missingTables = requiredTables.filter(
    (tableName) => !existingTables.has(tableName),
  );

  if (missingTables.length > 0) {
    throw new Error(
      `Incomplete database: missing tables [${missingTables.join(', ')}]. ` +
        `Run "npx prisma migrate deploy" then restart.`,
    );
  }
}

/**
 * Version de assertRequiredTables avec retry exponentiel.
 * Utile au démarrage : la base peut être en cours de migration.
 */
export async function assertRequiredTablesWithRetry(
  prisma: PrismaService,
  maxRetries = 5,
  baseDelayMs = 2000,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await assertRequiredTables(prisma);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 30_000);
        console.warn(
          `[Bootstrap] DB tables check failed (attempt ${attempt}/${maxRetries}). ` +
            `Retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
