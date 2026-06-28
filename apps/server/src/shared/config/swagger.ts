import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('DevOps Platform API')
    .setDescription('API de la plateforme centralisée de déploiement')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
}
