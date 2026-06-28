import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { SourceProvidersModule } from '../source-providers';
import { PreviewEnvironmentService } from './preview-environment.service';
import { PreviewEnvironmentsController } from './preview-environments.controller';

@Module({
  imports: [PrismaModule, SourceProvidersModule],
  controllers: [PreviewEnvironmentsController],
  providers: [PreviewEnvironmentService],
  exports: [PreviewEnvironmentService],
})
export class PreviewEnvironmentsModule {}
