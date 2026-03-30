import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { DeploymentsModule } from '../deployments/deployments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GitlabController } from './gitlab.controller';
import { GitlabService } from './gitlab.service';

@Module({
  imports: [PrismaModule, HttpModule, forwardRef(() => DeploymentsModule)],
  controllers: [GitlabController],
  providers: [GitlabService],
  exports: [GitlabService],
})
export class GitlabModule {}
