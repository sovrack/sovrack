import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { BuildDetectorService } from './build-detector.service';
import { BuildService } from './build.service';
import { CreateBuildConfigDto } from './dto/create-build-config.dto';

@Controller('projects/:id/build')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BuildController {
  constructor(
    private readonly buildService: BuildService,
    private readonly detector: BuildDetectorService,
  ) {}

  @Post('prepare')
  @Roles(Role.ADMIN)
  async prepare(@Param('id') id: string) {
    return await this.buildService.prepare(id);
  }

  @Get('detect')
  @Roles(Role.ADMIN)
  async detect(@Param('id') id: string) {
    return await this.detector.detectProjectType(id);
  }

  @Put('config')
  @Roles(Role.ADMIN)
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: CreateBuildConfigDto,
  ) {
    await this.buildService.updateBuildConfig(id, dto);
    return { message: 'Configuration mise à jour' };
  }

  @Get('templates')
  @Roles(Role.ADMIN)
  getTemplates() {
    return this.buildService.getTemplates();
  }

  @Post('push-files')
  @Roles(Role.ADMIN)
  async pushFiles(@Param('id') id: string) {
    await this.buildService.pushFiles(id);
    return { message: 'Fichiers poussés avec succès' };
  }
}
