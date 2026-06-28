import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { ServiceEnvironmentsModule } from '../service-environments/service-environments.module';
import { EnvironmentsController } from './environments.controller';
import { EnvironmentsService } from './environments.service';
import { ProjectAccessModule } from '../access/project-access.module';

@Module({
  imports: [PrismaModule, ServiceEnvironmentsModule, ProjectAccessModule],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService],
  exports: [EnvironmentsService],
})
export class EnvironmentsModule {}
