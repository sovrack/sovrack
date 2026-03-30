import { Module, forwardRef } from '@nestjs/common';
import { ConfigsModule } from '../configs/configs.module';
import { GitlabModule } from '../gitlab/gitlab.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsGateway } from './deployments.gateway';
import { DeploymentsService } from './deployments.service';

@Module({
  imports: [PrismaModule, forwardRef(() => GitlabModule), ConfigsModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DeploymentsGateway],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
