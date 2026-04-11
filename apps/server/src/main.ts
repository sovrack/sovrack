import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

function resolveAllowedOrigins(): string[] {
  const envOrigins = [
    process.env.FRONTEND_URLS,
    process.env.FRONTEND_URL,
  ]
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

  // Validation globale
  app.useGlobalPipes(new ValidationPipe());

  // CORS pour le frontend
  app.enableCors({ origin: resolveAllowedOrigins() });

  // Configuration Swagger
  const config = new DocumentBuilder()
    .setTitle('DevOps Platform API')
    .setDescription('API de la plateforme centralisée de déploiement')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
  console.log(`Swagger UI      -> http://localhost:${port}/api`);
}
bootstrap().catch(console.error);
