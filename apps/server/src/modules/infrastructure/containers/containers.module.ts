import { Module } from '@nestjs/common';
import { ServersModule } from '../servers/servers.module';
import { ContainersController } from './containers.controller';
import { ContainersService } from './containers.service';
import { ContainerStatsService } from './services/container-stats.service';
import { ContainersGateway } from './gateways/containers.gateway';
import { AppJwtModule } from '../../../shared/jwt/jwt.module';

@Module({
  imports: [ServersModule, AppJwtModule],
  controllers: [ContainersController],
  providers: [ContainersService, ContainerStatsService, ContainersGateway],
  exports: [ContainersService, ContainerStatsService],
})
export class ContainersModule {}
