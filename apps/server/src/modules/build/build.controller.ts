import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
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
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async prepare(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.buildService.prepare(id, user.id, user.role);
  }

  @Get('detect')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async detect(@Param('id') id: string, @GetUser() user: JwtPayload) {
    await this.buildService.assertCanConfigureBuild(id, user.id, user.role);
    return await this.detector.detectProjectType(id);
  }

  @Put('config')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async updateConfig(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: CreateBuildConfigDto,
  ) {
    await this.buildService.updateBuildConfig(id, dto, user.id, user.role);
    return { message: 'Configuration mise à jour' };
  }

  @Get('templates')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async getTemplates(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.buildService.getTemplates(id, user.id, user.role);
  }

  @Post('push-files')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async pushFiles(@Param('id') id: string, @GetUser() user: JwtPayload) {
    await this.buildService.pushFiles(id, user.id, user.role);
    return { message: 'Fichiers poussés avec succès' };
  }
}
