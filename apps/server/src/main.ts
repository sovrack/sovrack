import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validation globale
  app.useGlobalPipes(new ValidationPipe());

  // CORS pour le frontend
  app.enableCors({ origin: 'http://localhost:3000' });

  // Configuration Swagger
  const config = new DocumentBuilder()
    .setTitle('DevOps Platform API')
    .setDescription('API de la plateforme centralisée de déploiement')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3001);
  void app.listen(3001);
  console.log('Backend running on http://localhost:3001');
  console.log('Swagger UI      → http://localhost:3001/api');
}
bootstrap().catch(console.error);
