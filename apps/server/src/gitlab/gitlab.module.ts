import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GitlabController } from './gitlab.controller';
import { GitlabService } from './gitlab.service';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [GitlabController],
  providers: [GitlabService],
})
export class GitlabModule {}
