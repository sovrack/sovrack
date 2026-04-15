import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { ConfigsModule } from '../configs/configs.module';
import { GitlabModule } from '../gitlab/gitlab.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsGateway } from './deployments.gateway';
import { DeploymentsService } from './deployments.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => GitlabModule),
    ConfigsModule,
    // JwtModule pour la validation des tokens dans le WebSocket gateway.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            "JWT_SECRET non configuré dans les variables d'environnement",
          );
        }
        return { secret };
      },
    }),
  ],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DeploymentsGateway],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
