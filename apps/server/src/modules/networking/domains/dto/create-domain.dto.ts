import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateDomainDto {
  @ApiProperty({ example: 'example.com' })
  @IsString()
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, {
    message: 'Domaine invalide',
  })
  name!: string;

  @ApiPropertyOptional({ example: 'dns-provider-uuid' })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ example: 'project-uuid' })
  @IsOptional()
  @IsString()
  projectId?: string;

  // Rattache le domaine à un service×environnement → l'executor pose la route
  // Traefik (HTTPS) vers ce conteneur au déploiement.
  @ApiPropertyOptional({ example: 'service-env-uuid' })
  @IsOptional()
  @IsString()
  serviceEnvId?: string;
}
