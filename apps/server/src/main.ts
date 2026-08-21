import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import type { Application, NextFunction, Request, Response } from 'express';
import express from 'express';
import { randomUUID } from 'crypto';
import { AllExceptionsFilter } from './boot/http-exception.filter';
import { LoggerService } from './shared/logger/logger.service';
import { buildSwaggerConfig } from './boot/swagger';
import { PrismaService } from './shared/database/prisma.service';
import { RedisIoAdapter } from './boot/redis-io.adapter';
import { runsBackgroundWork } from './shared/utils/process-role.util';
import { BigIntSerializationInterceptor } from './boot/bigint.interceptor';
import { runWithLogContext } from './shared/logger/log-context';
import {
  assertRequiredEnv,
  assertRequiredTablesWithRetry,
  isAllowedCorsOrigin,
  recoverInFlightDeployments,
  reportWebhookConfiguration,
  resolveAllowedOrigins,
  verifyAnsibleCollectionVersions,
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
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        // Conserve le body brut pour les webhooks signés (Stripe) même si le
        // body JSON a déjà été parsé par express.json.
        if (buf?.length) {
          (req as Request & { rawBody?: Buffer }).rawBody = buf;
        }
      },
    }),
  );
  const logger = app.get(LoggerService);
  const prisma = app.get(PrismaService);
  const allowedOrigins = new Set(resolveAllowedOrigins());

  const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'same-origin' },
      xContentTypeOptions: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
    }),
  );
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

  // Cross-process WebSocket broadcast: with the API and worker as separate
  // processes, a gateway emit from the worker (live setup/automation logs) must
  // reach clients connected to the API. The Redis adapter shares broadcast
  // state across every Socket.IO server instance. No-op fallback if no Redis.
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    const redisIoAdapter = new RedisIoAdapter(app);
    redisIoAdapter.connectToRedis(redisUrl);
    app.useWebSocketAdapter(redisIoAdapter);
    logger.log('WebSocket Redis adapter enabled (cross-process)', 'Bootstrap');
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const incomingRequestId = req.headers['x-request-id'];
    const normalizedRequestId =
      typeof incomingRequestId === 'string' ? incomingRequestId.trim() : '';
    const requestId = /^[a-zA-Z0-9._:-]{1,128}$/.test(normalizedRequestId)
      ? normalizedRequestId
      : randomUUID();

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
  // En production, Swagger reste disponible mais n'est servi qu'après
  // authentification simple afin que les assets UI et le JSON de doc restent
  // accessibles au navigateur une fois l'accès validé.
  const swaggerEnabled =
    (process.env.NODE_ENV ?? 'development') !== 'production';
  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    SwaggerModule.setup('api', app, document);
  } else if (process.env.SWAGGER_API_KEY) {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

    const isSwaggerPath = (url: string): boolean => {
      const path = url.split('?')[0] ?? url;
      return (
        path === '/api/docs' ||
        path.startsWith('/api/docs/') ||
        path === '/api/docs-json' ||
        path === '/api/docs-yaml'
      );
    };

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (!isSwaggerPath(req.originalUrl)) {
        next();
        return;
      }

      const directKey = req.headers['x-swagger-key'];
      if (
        typeof directKey === 'string' &&
        directKey === process.env.SWAGGER_API_KEY
      ) {
        next();
        return;
      }

      const authorization = req.headers.authorization;
      if (
        typeof authorization === 'string' &&
        authorization.startsWith('Basic ')
      ) {
        const encoded = authorization.slice('Basic '.length).trim();
        try {
          const decoded = Buffer.from(encoded, 'base64').toString('utf8');
          const separatorIndex = decoded.indexOf(':');
          const password =
            separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : decoded;
          if (password === process.env.SWAGGER_API_KEY) {
            next();
            return;
          }
        } catch {
          // fall through to 401
        }
      }

      res.setHeader('WWW-Authenticate', 'Basic realm="Swagger UI"');
      res.status(401).json({
        statusCode: 401,
        message: 'Authenticate to access API documentation.',
      });
    });

    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { supportedSubmitMethods: [] },
    });
    logger.log(
      'Swagger UI (protected) -> /api/docs (X-Swagger-Key or Basic auth)',
      'Bootstrap',
    );
  }

  await assertRequiredTablesWithRetry(prisma, 5, 2000);
  // Startup recovery marks in-flight deployments FAILED on the assumption they
  // died with this process. That's only true for the process that OWNS deploy
  // execution (the worker) — an API restart must not FAIL the worker's live
  // deployments. Single-process mode ("all") still runs it.
  if (runsBackgroundWork()) {
    await recoverInFlightDeployments(app, logger);
    // Only the process that actually spawns ansible-playbook needs this —
    // an API-only replica never touches Ansible, so it shouldn't pay the
    // ~1-2s subprocess cost or care if a collection is stale.
    await verifyAnsibleCollectionVersions(logger);
  }
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
