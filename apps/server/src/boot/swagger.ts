import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Sovrack API')
    .setDescription(
      'API de la plateforme souveraine de déploiement multi-serveurs',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
}
