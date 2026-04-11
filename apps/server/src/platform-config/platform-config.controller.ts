import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformConfigService } from './platform-config.service';

class UpdatePlatformConfigDto {
  @IsString({ message: 'La valeur doit être une chaîne' })
  @IsNotEmpty({ message: 'La valeur est obligatoire' })
  value!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isSecret doit être un booléen' })
  isSecret?: boolean;
}

@ApiTags('Platform Config')
@ApiBearerAuth()
@Controller('admin/platform-config')
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlatformConfigController {
  constructor(private readonly platformConfigService: PlatformConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Lister toutes les configurations globales' })
  @ApiResponse({
    status: 200,
    description: 'Liste retournée (secrets masqués)',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({
    status: 403,
    description: 'Action réservée aux administrateurs',
  })
  async getAll() {
    return await this.platformConfigService.getAll();
  }

  @Put(':key')
  @ApiOperation({ summary: 'Mettre à jour une configuration globale' })
  @ApiResponse({ status: 200, description: 'Configuration mise à jour' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({
    status: 403,
    description: 'Action réservée aux administrateurs',
  })
  async setConfig(
    @Param('key') key: string,
    @Body() dto: UpdatePlatformConfigDto,
  ) {
    return await this.platformConfigService.set(
      key,
      dto.value,
      dto.isSecret ?? false,
    );
  }

  @Post('test-gitlab')
  @ApiOperation({ summary: 'Tester la connexion GitLab globale' })
  @ApiResponse({ status: 201, description: 'Connexion GitLab testée' })
  @ApiResponse({
    status: 400,
    description: 'Configuration invalide ou test KO',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({
    status: 403,
    description: 'Action réservée aux administrateurs',
  })
  async testGitlab() {
    return await this.platformConfigService.testGitlab();
  }
}
