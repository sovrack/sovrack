import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { ServiceEnvironmentsController } from './service-environments.controller';
import { ServiceEnvironmentsService } from './service-environments.service';
import { ProjectAccessModule } from '../authorization/project-access.module';

@Module({
  imports: [PrismaModule, ProjectAccessModule],
  controllers: [ServiceEnvironmentsController],
  providers: [ServiceEnvironmentsService],
  exports: [ServiceEnvironmentsService],
})
export class ServiceEnvironmentsModule {}
