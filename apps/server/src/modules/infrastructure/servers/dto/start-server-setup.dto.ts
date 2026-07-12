import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * "Setup Server" installe un jeu FIXE et COMPLET, décidé côté backend
 * (server-setup.ts) — sans profil, sans option, sans case à cocher : tout ce
 * qui est nécessaire à un bon déploiement s'installe systématiquement (y
 * compris GitLab Runner et la stack Grafana/Prometheus/Loki). Seul le mode
 * d'exécuteur GitLab Runner reste paramétrable — pas SI il s'installe, juste
 * COMMENT.
 */
export class StartServerSetupDto {
  @ApiPropertyOptional({
    example: 'docker',
    description:
      'Executor mode for GitLab Runner. docker implies Docker dependency.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  gitlabRunnerExecutor?: string;
}
