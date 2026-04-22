import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GitlabModule } from '../gitlab/gitlab.module';
import { BuildController } from './build.controller';
import { BuildDetectorService } from './build-detector.service';
import { BuildGeneratorService } from './build-generator.service';
import { BuildService } from './build.service';

@Module({
  imports: [PrismaModule, HttpModule, GitlabModule],
  controllers: [BuildController],
  providers: [BuildService, BuildDetectorService, BuildGeneratorService],
  exports: [BuildService],
})
export class BuildModule {}
