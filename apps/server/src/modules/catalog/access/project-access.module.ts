import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { ProjectAccessService } from './project-access.service';

/**
 * Shared project-scoped authorization, imported by every catalog sub-module.
 * Depends only on PrismaModule so it never creates a circular import.
 */
@Module({
  imports: [PrismaModule],
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}
