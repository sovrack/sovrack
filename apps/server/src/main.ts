import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
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
  assertRequiredTables,
  isAllowedCorsOrigin,
  recoverInFlightDeployments,
  reportWebhookConfiguration,
  resolveAllowedOrigins,
} from './boot/boot-helpers';
async function bootstrap() {
  assertRequiredEnv();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = app.get(LoggerService);
  const prisma = app.get(PrismaService);
  const allowedOrigins = new Set(resolveAllowedOrigins());

  // Security headers (CSP, HSTS, no-sniff, frameguard...) + gzip compression.
  // CSP is enabled in production (helmet's safe defaults) where the API serves
  // only JSON; in development it's disabled so the Swagger UI (inline
  // scripts/styles) keeps working. Swagger is itself prod-gated below.
  const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
  app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false }));
  app.use(compression());

  // Behind a reverse proxy (Traefik), trust the configured number of hops so
  // req.ip / rate-limiting see the REAL client IP and X-Forwarded-For from
  // untrusted hops can't be spoofed. Off by default (direct connection).
  // Set TRUST_PROXY=1 in production behind a single proxy.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) {
    const hops = Number(trustProxy);
    const expressApp = app.getHttpAdapter().getInstance() as Application;
    expressApp.set('trust proxy', Number.isFinite(hops) ? hops : trustProxy);
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

  // Swagger — exposé hors production uniquement (évite de divulguer la
  // cartographie complète de l'API à un attaquant en prod).
  const swaggerEnabled =
    (process.env.NODE_ENV ?? 'development') !== 'production';
  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    SwaggerModule.setup('api', app, document);
  }

  await assertRequiredTables(prisma);
  await recoverInFlightDeployments(app, logger);
  reportWebhookConfiguration(logger);

  const port = Number(process.env.PORT ?? '3001') || 3001;
  await app.listen(port);
  logger.log(`Backend running on http://localhost:${port}`, 'Bootstrap');
  if (swaggerEnabled) {
    logger.log(`Swagger UI      -> http://localhost:${port}/api`, 'Bootstrap');
  }
}
// Sur toute erreur de boot (ex. EADDRINUSE si un 2e backend démarre alors qu'un
// 1er tient déjà le port), on QUITTE le process. Sinon le worker BullMQ — démarré
// pendant l'init des modules, avant app.listen() — resterait vivant en zombie« »
// et consommerait des jobs de déploiement en parallèle de l'instance saine.
// NB pratique : si le port est squatté par un vieux `node dist/main`, le watch
// (start:dev) ne peut pas écouter et sert du code périmé → `lsof -i:3001` puis kill.
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
