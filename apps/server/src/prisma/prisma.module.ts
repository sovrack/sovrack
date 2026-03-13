import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Module Prisma global pour injection du PrismaService.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
