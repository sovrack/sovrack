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
import { DeploymentsService } from './modules/deployments/deployments.service';
import { BigIntSerializationInterceptor } from './core/interceptors/bigint.interceptor';

function resolveAllowedOrigins(): string[] {
  const envOrigins = [process.env.FRONTEND_URLS ?? '', process.env.FRONTEND_URL ?? '']
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

function isAllowedCorsOrigin(origin: string, allowedOrigins: Set<string>): boolean {
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
        `[req:${requestId}] ` +
        `${req.method} ${req.originalUrl} -> ${String(res.statusCode)} ` +
        `${String(durationMs)}ms`;
      logger.log(line, 'HTTP');
    });

    next();
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
    origin: (origin, callback) => {
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
bootstrap().catch(console.error);

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
      'WEBHOOK_URL non configurée: les webhooks GitLab resteront en attente tant qu’aucune URL publique backend n’est définie.',
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
    const deploymentsService = app.get(DeploymentsService);
    const recovered =
      await deploymentsService.recoverInFlightDeploymentsAfterRestart();

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
