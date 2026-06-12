import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { ServiceEnvironmentsModule } from '../service-environments/service-environments.module';
import { EnvironmentsController } from './environments.controller';
import { EnvironmentsService } from './environments.service';

@Module({
  imports: [PrismaModule, ServiceEnvironmentsModule],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService],
  exports: [EnvironmentsService],
})
export class EnvironmentsModule {}
