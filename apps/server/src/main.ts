import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import type { Application, NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AllExceptionsFilter } from './shared/filters/http-exception.filter';
import { LoggerService } from './shared/logger/logger.service';
import { buildSwaggerConfig } from './shared/config/swagger';
import { PrismaService } from './shared/database/prisma.service';
import { BigIntSerializationInterceptor } from './shared/interceptors/bigint.interceptor';
import { runWithLogContext } from './shared/logger/log-context';
import {
  assertRequiredEnv,
  assertRequiredTablesWithRetry,
  isAllowedCorsOrigin,
  recoverInFlightDeployments,
  reportWebhookConfiguration,
  resolveAllowedOrigins,
} from './boot/boot-helpers';

const SANITIZE_QUERY_KEYS = [
  'token',
  'password',
  'secret',
  'api_key',
  'private_key',
  'access_token',
];

function sanitizeUrlForLogs(url: string): string {
  try {
    const questionIndex = url.indexOf('?');
    if (questionIndex === -1) return url;
    const path = url.slice(0, questionIndex);
    const params = new URLSearchParams(url.slice(questionIndex + 1));
    for (const key of SANITIZE_QUERY_KEYS) {
      if (params.has(key)) params.set(key, '[REDACTED]');
    }
    return `${path}?${params.toString()}`;
  } catch {
    return url;
  }
}

async function bootstrap() {
  assertRequiredEnv();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = app.get(LoggerService);
  const prisma = app.get(PrismaService);
  const allowedOrigins = new Set(resolveAllowedOrigins());

  const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
  app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false }));
  app.use(compression());

  // Parse TRUST_PROXY : nombre, "true"/"false", ou IP.
  // Exemples valides : "1", "2", "true", "false", "loopback", "10.0.0.1"
  const trustProxyRaw = process.env.TRUST_PROXY?.trim().toLowerCase();
  if (trustProxyRaw) {
    const expressApp = app.getHttpAdapter().getInstance() as Application;
    const trueValues = ['true', '1', 'yes'];
    const falseValues = ['false', '0', 'no'];
    if (trueValues.includes(trustProxyRaw)) {
      expressApp.set('trust proxy', true);
    } else if (falseValues.includes(trustProxyRaw)) {
      expressApp.set('trust proxy', false);
    } else {
      const hops = Number(trustProxyRaw);
      if (Number.isFinite(hops) && Number.isInteger(hops) && hops > 0) {
        expressApp.set('trust proxy', hops);
      } else {
        expressApp.set('trust proxy', trustProxyRaw);
        logger.warn(
          `TRUST_PROXY="${trustProxyRaw}" interprété comme une adresse/fonction.` +
            " Si ce n'est pas intentionnel, utilisez un nombre (ex: TRUST_PROXY=1).",
          'Bootstrap',
        );
      }
    }
  }

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
      const safeUrl = sanitizeUrlForLogs(req.originalUrl);
      const line =
        `${req.method} ${safeUrl} -> ${String(res.statusCode)} ` +
        `${String(durationMs)}ms`;
      logger.log(line, 'HTTP');
    });

    try {
      runWithLogContext({ correlationId: requestId }, () => next());
    } catch (err) {
      next(err);
    }
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

  // Swagger — exposé hors production uniquement (évite de divulguer la
  // cartographie complète de l'API à un attaquant en prod).
  // En production, Swagger est exposé sous /api/docs et protégé par une
  // vérification basique : présence du header X-Swagger-Key = SWAGGER_API_KEY.
  const swaggerEnabled =
    (process.env.NODE_ENV ?? 'development') !== 'production';
  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    SwaggerModule.setup('api', app, document);
  } else if (process.env.SWAGGER_API_KEY) {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { supportedSubmitMethods: [] },
    });
    app.use('/api/docs', (req: Request, res: Response, next: NextFunction) => {
      const key = req.headers['x-swagger-key'] as string | undefined;
      if (key === process.env.SWAGGER_API_KEY) return next();
      res.status(401).json({
        statusCode: 401,
        message: 'Set X-Swagger-Key header to access API documentation.',
      });
    });
    logger.log(
      'Swagger UI (protected) -> /api/docs (set X-Swagger-Key header)',
      'Bootstrap',
    );
  }

  await assertRequiredTablesWithRetry(prisma, 5, 2000);
  await recoverInFlightDeployments(app, logger);
  reportWebhookConfiguration(logger);

  const port = Number(process.env.PORT ?? '3001') || 3001;
  await app.listen(port);
  logger.log(`Backend running on http://localhost:${port}`, 'Bootstrap');
  if (swaggerEnabled) {
    logger.log(`Swagger UI      -> http://localhost:${port}/api`, 'Bootstrap');
  }

  return app;
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────
// On stocke la référence à l'app pour pouvoir l'arrêter proprement.
let runningApp: INestApplication | null = null;
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Bootstrap] Received ${signal}. Starting graceful shutdown...`);

  const timeout = setTimeout(() => {
    console.error(
      '[Bootstrap] Graceful shutdown timed out after 30s. Force exiting.',
    );
    process.exit(1);
  }, 30000);
  timeout.unref();

  if (runningApp) {
    try {
      await runningApp.close();
      console.log('[Bootstrap] HTTP/WebSocket server closed.');
    } catch (err) {
      console.error('[Bootstrap] Error during app.close():', err);
    }
  }

  clearTimeout(timeout);
  console.log('[Bootstrap] Graceful shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Sur toute erreur de boot (ex. EADDRINUSE si un 2e backend démarre alors qu'un
// 1er tient déjà le port), on QUITTE le process. Sinon le worker BullMQ — démarré
// pendant l'init des modules, avant app.listen() — resterait vivant en zombie« »
// et consommerait des jobs de déploiement en parallèle de l'instance saine.
bootstrap()
  .then((app) => {
    runningApp = app;
  })
  .catch((err) => {
    console.error('Fatal boot error:', err);
    process.exit(1);
  });
