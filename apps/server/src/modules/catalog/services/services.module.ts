import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { ServiceEnvironmentsModule } from '../service-environments/service-environments.module';
import { SourceProvidersModule } from '../../source-providers';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [PrismaModule, ServiceEnvironmentsModule, SourceProvidersModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
