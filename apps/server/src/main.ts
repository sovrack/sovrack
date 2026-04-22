import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggerService } from './common/logger/logger.service';
import { buildSwaggerConfig } from './common/config/swagger';
import { PrismaService } from './prisma/prisma.service';
import { DeploymentsService } from './modules/deployments/deployments.service';

function resolveAllowedOrigins(): string[] {
  const envOrigins = [process.env.FRONTEND_URLS, process.env.FRONTEND_URL]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (envOrigins.length > 0) {
    return Array.from(new Set(envOrigins));
  }

  // Fallback local: Next peut basculer sur 3002 si 3000 est occupé.
  return ['http://localhost:3000', 'http://localhost:3002'];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = app.get(LoggerService);
  const prisma = app.get(PrismaService);

  app.useGlobalFilters(new AllExceptionsFilter(logger));

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
    origin: resolveAllowedOrigins(),
    credentials: true,
  });

  // Configuration Swagger
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  SwaggerModule.setup('api', app, document);

  await assertRequiredTables(prisma);
  await recoverInFlightDeployments(app, logger);

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  logger.log(`Backend running on http://localhost:${port}`, 'Bootstrap');
  logger.log(`Swagger UI      -> http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap().catch(console.error);

async function recoverInFlightDeployments(
  app: INestApplication,
  logger: LoggerService,
): Promise<void> {
  try {
    const deploymentsService = app.get(DeploymentsService, {
      strict: false,
    });
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
