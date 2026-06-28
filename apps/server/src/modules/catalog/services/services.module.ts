import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { ServiceEnvironmentsModule } from '../service-environments/service-environments.module';
import { SourceProvidersModule } from '../../source-providers';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { ProjectAccessModule } from '../access/project-access.module';

@Module({
  imports: [
    PrismaModule,
    ServiceEnvironmentsModule,
    SourceProvidersModule,
    ProjectAccessModule,
  ],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
