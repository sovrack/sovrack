import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AllExceptionsFilter } from './core/filters/http-exception.filter';
import { LoggerService } from './core/logger/logger.service';
import { buildSwaggerConfig } from './core/config/swagger';
import { PrismaService } from './core/database/prisma.service';
import { DeploymentsLifecycleService } from './modules/deployments/core/deployments-lifecycle.service';
import { BigIntSerializationInterceptor } from './core/interceptors/bigint.interceptor';
import { runWithLogContext } from './core/logger/log-context';

type RequiredEnv = {
  name: string;
  hint: string;
  /** Optional extra rule beyond "present and non-empty". Returns an error label or null. */
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
  { name: 'ANSIBLE_PLAYBOOKS_PATH', hint: 'Path to devops/ansible/playbooks' },
  { name: 'ANSIBLE_VENV_PATH', hint: 'Path to the Ansible virtualenv' },
];

/**
 * Fail fast BEFORE NestFactory.create() so the operator gets the COMPLETE list
 * of missing/invalid env vars in one shot, instead of a half-built NestJS app
 * crashing on the first one (which is confusing and hides the others).
 */
function assertRequiredEnv(): void {
  const problems: string[] = [];
  for (const { name, hint, validate } of REQUIRED_ENV) {
    const value = process.env[name]?.trim();
    if (!value) {
      problems.push(`${name.padEnd(22)}→ ${hint}`);
      continue;
    }
    const invalid = validate?.(value);
    if (invalid) {
      problems.push(`${name.padEnd(22)}→ ${hint} (${invalid})`);
    }
  }

  if (problems.length > 0) {
    const message = [
      '[BOOT] ❌ Missing or invalid required environment variables:',
      ...problems.map((line) => `  - ${line}`),
      'Fix your .env file and restart.',
    ].join('\n');
    // Use console.error here on purpose: the LoggerService is not available
    // yet (NestFactory has not run) and we are about to exit the process.
    console.error(message);
    process.exit(1);
  }
}

function resolveAllowedOrigins(): string[] {
  const envOrigins = [
    process.env.FRONTEND_URLS ?? '',
    process.env.FRONTEND_URL ?? '',
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const localDevOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
  ];

  if ((process.env.NODE_ENV ?? 'development') !== 'production') {
    return Array.from(new Set([...envOrigins, ...localDevOrigins]));
  }

  if (envOrigins.length > 0) {
    return Array.from(new Set(envOrigins));
  }

  return localDevOrigins;
}

function isAllowedCorsOrigin(
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

async function bootstrap() {
  assertRequiredEnv();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = app.get(LoggerService);
  const prisma = app.get(PrismaService);
  const allowedOrigins = new Set(resolveAllowedOrigins());

  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.useGlobalInterceptors(new BigIntSerializationInterceptor());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const incomingRequestId = req.headers['x-request-id'];
    const requestId =
      (typeof incomingRequestId === 'string' && incomingRequestId.trim()) ||
      randomUUID();

    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const line =
        `${req.method} ${req.originalUrl} -> ${String(res.statusCode)} ` +
        `${String(durationMs)}ms`;
      logger.log(line, 'HTTP');
    });

    // Establish the correlation context for the whole request so every log line
    // emitted downstream (services, gateways) carries the same correlationId.
    runWithLogContext({ correlationId: requestId }, () => next());
  });

  // Validation globale stricte (sécurité + DTOs prévisibles)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS pour le frontend
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || isAllowedCorsOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  });

  // Configuration Swagger
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  SwaggerModule.setup('api', app, document);

  await assertRequiredTables(prisma);
  await recoverInFlightDeployments(app, logger);
  reportWebhookConfiguration(logger);

  const port = Number(process.env.PORT ?? '3001') || 3001;
  await app.listen(port);
  logger.log(`Backend running on http://localhost:${port}`, 'Bootstrap');
  logger.log(`Swagger UI      -> http://localhost:${port}/api`, 'Bootstrap');
}
// Sur toute erreur de boot (ex. EADDRINUSE si un 2ᵉ backend démarre alors qu'un
// 1ᵉr tient déjà le port), on QUITTE le process. Sinon le worker BullMQ — démarré
// pendant l'init des modules, avant app.listen() — resterait vivant en « zombie »
// et consommerait des jobs de déploiement en parallèle de l'instance saine.
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

function reportWebhookConfiguration(logger: LoggerService): void {
  const autoConfigureWebhook = !['0', 'false', 'no', 'off'].includes(
    process.env.GITLAB_WEBHOOK_AUTO_CONFIGURE?.trim().toLowerCase() ?? 'false',
  );

  if (!autoConfigureWebhook) {
    logger.log(
      'GITLAB_WEBHOOK_AUTO_CONFIGURE=false: la configuration automatique des webhooks est désactivée (mode build sans webhook).',
      'Bootstrap',
    );
    return;
  }

  const rawWebhookUrl = (process.env.WEBHOOK_URL ?? '').trim();
  if (!rawWebhookUrl) {
    logger.warn(
      "WEBHOOK_URL non définie dans l'env. Les webhooks GitLab/GitHub utiliseront PlatformConfig.WEBHOOK_BASE_URL (DB, modifiable via UI Réglages).",
      'Bootstrap',
    );
    return;
  }

  try {
    const parsed = new URL(rawWebhookUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      logger.warn(
        `WEBHOOK_URL invalide (schéma non supporté): ${rawWebhookUrl}`,
        'Bootstrap',
      );
      return;
    }
  } catch {
    logger.warn(
      `WEBHOOK_URL invalide (URL absolue attendue): ${rawWebhookUrl}`,
      'Bootstrap',
    );
  }
}

async function recoverInFlightDeployments(
  app: INestApplication,
  logger: LoggerService,
): Promise<void> {
  try {
    const lifecycleService = app.get(DeploymentsLifecycleService);
    const recovered =
      await lifecycleService.recoverInFlightDeploymentsAfterRestart();

    if (recovered > 0) {
      logger.warn(
        `Startup recovery: ${String(recovered)} déploiement(s) in-flight basculés en FAILED.`,
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

async function assertRequiredTables(prisma: PrismaService): Promise<void> {
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
      `Base de données incomplète: tables manquantes [${missingTables.join(', ')}]. ` +
        `Appliquez les migrations avec "npx prisma migrate deploy" puis redémarrez le backend.`,
    );
  }
}
