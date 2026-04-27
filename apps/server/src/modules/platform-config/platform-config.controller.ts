import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role, RegistryProviderType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
} from 'class-validator';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
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

class CreateGitlabProviderDto {
  @IsString({ message: 'Name doit être une chaîne' })
  @IsNotEmpty({ message: 'Name est obligatoire' })
  name!: string;

  @IsString({ message: 'GitLab URL doit être une chaîne' })
  @IsNotEmpty({ message: 'GitLab URL est obligatoire' })
  gitlabUrl!: string;

  @IsOptional()
  @IsString({ message: 'Internal URL doit être une chaîne' })
  internalUrl?: string;

  @IsOptional()
  @IsString({ message: 'Redirect URI doit être une chaîne' })
  redirectUri?: string;

  @IsOptional()
  @IsString({ message: 'Application ID doit être une chaîne' })
  applicationId?: string;

  @IsOptional()
  @IsString({ message: 'Application Secret doit être une chaîne' })
  applicationSecret?: string;

  @IsOptional()
  @IsString({ message: 'Group names doit être une chaîne' })
  groupNames?: string;

  @IsOptional()
  @IsString({ message: 'Admin token doit être une chaîne' })
  adminToken?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isDefault doit être un booléen' })
  isDefault?: boolean;
}

class UpdateGitlabProviderDto {
  @IsOptional()
  @IsString({ message: 'Name doit être une chaîne' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'GitLab URL doit être une chaîne' })
  gitlabUrl?: string;

  @IsOptional()
  @IsString({ message: 'Internal URL doit être une chaîne' })
  internalUrl?: string;

  @IsOptional()
  @IsString({ message: 'Redirect URI doit être une chaîne' })
  redirectUri?: string;

  @IsOptional()
  @IsString({ message: 'Application ID doit être une chaîne' })
  applicationId?: string;

  @IsOptional()
  @IsString({ message: 'Application Secret doit être une chaîne' })
  applicationSecret?: string;

  @IsOptional()
  @IsString({ message: 'Group names doit être une chaîne' })
  groupNames?: string;

  @IsOptional()
  @IsString({ message: 'Admin token doit être une chaîne' })
  adminToken?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isDefault doit être un booléen' })
  isDefault?: boolean;
}

class CreateRegistryConfigDto {
  @IsString({ message: 'Name doit être une chaîne' })
  @IsNotEmpty({ message: 'Name est obligatoire' })
  name!: string;

  @IsEnum(RegistryProviderType, { message: 'Type de registre invalide' })
  @IsNotEmpty({ message: 'Type est obligatoire' })
  type!: RegistryProviderType;

  @IsOptional()
  @IsString({ message: 'Username doit être une chaîne' })
  username?: string;

  @IsOptional()
  @IsString({ message: 'Password doit être une chaîne' })
  password?: string;

  @IsOptional()
  @IsString({ message: 'Registry URL doit être une chaîne' })
  registryUrl?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isDefault doit être un booléen' })
  isDefault?: boolean;
}

class UpdateRegistryConfigDto {
  @IsOptional()
  @IsString({ message: 'Name doit être une chaîne' })
  name?: string;

  @IsOptional()
  @IsEnum(RegistryProviderType, { message: 'Type de registre invalide' })
  type?: RegistryProviderType;

  @IsOptional()
  @IsString({ message: 'Username doit être une chaîne' })
  username?: string;

  @IsOptional()
  @IsString({ message: 'Password doit être une chaîne' })
  password?: string;

  @IsOptional()
  @IsString({ message: 'Registry URL doit être une chaîne' })
  registryUrl?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isDefault doit être un booléen' })
  isDefault?: boolean;
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
  async getAll() {
    return await this.platformConfigService.getAll();
  }

  @Put(':key')
  @ApiOperation({ summary: 'Mettre à jour une configuration globale' })
  @ApiResponse({ status: 200, description: 'Configuration mise à jour' })
  async setConfig(
    @Param('key') key: string,
    @Body() dto: UpdatePlatformConfigDto,
  ) {
    return await this.platformConfigService.set(key, dto.value, dto.isSecret);
  }

  @Get('gitlab/providers')
  @ApiOperation({ summary: 'Lister les providers GitLab' })
  async listGitlabProviders() {
    return await this.platformConfigService.listGitlabProviders();
  }

  @Post('gitlab/providers')
  @ApiOperation({ summary: 'Créer un provider GitLab' })
  async createGitlabProvider(@Body() dto: CreateGitlabProviderDto) {
    return await this.platformConfigService.createGitlabProvider(dto);
  }

  @Put('gitlab/providers/:id')
  @ApiOperation({ summary: 'Mettre à jour un provider GitLab' })
  async updateGitlabProvider(
    @Param('id') id: string,
    @Body() dto: UpdateGitlabProviderDto,
  ) {
    return await this.platformConfigService.updateGitlabProvider(id, dto);
  }

  @Delete('gitlab/providers/:id')
  @ApiOperation({ summary: 'Supprimer un provider GitLab' })
  async deleteGitlabProvider(@Param('id') id: string) {
    await this.platformConfigService.deleteGitlabProvider(id);
    return { ok: true };
  }

  @Post('gitlab/providers/:id/default')
  @ApiOperation({ summary: 'Définir un provider GitLab par défaut' })
  async setDefaultGitlabProvider(@Param('id') id: string) {
    return await this.platformConfigService.setDefaultGitlabProvider(id);
  }

  @Post('gitlab/providers/:id/test')
  @ApiOperation({ summary: 'Tester la connexion GitLab pour un provider' })
  async testGitlabProvider(@Param('id') id: string) {
    return await this.platformConfigService.testGitlab(id);
  }

  @Post('gitlab/providers/:id/oauth/start')
  @ApiOperation({ summary: 'Démarrer OAuth GitLab pour un provider' })
  async startGitlabOAuthForProvider(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return await this.platformConfigService.startGitlabOAuthForProvider(
      id,
      this.resolvePublicBaseUrl(req),
    );
  }

  @Post('test-gitlab')
  @ApiOperation({
    summary: 'Tester la connexion GitLab globale (default provider)',
  })
  async testGitlab() {
    return await this.platformConfigService.testGitlab();
  }

  @Post('gitlab/oauth/start')
  @ApiOperation({ summary: 'Démarrer OAuth GitLab global (default provider)' })
  async startGitlabOAuth(@Req() req: Request) {
    return await this.platformConfigService.startGitlabOAuth(
      this.resolvePublicBaseUrl(req),
    );
  }

  // ============= Registry Configuration Endpoints =============

  @Get('registries')
  @ApiOperation({ summary: 'Lister les configurations de registre' })
  async listRegistries() {
    return await this.platformConfigService.listRegistryConfigs();
  }

  @Post('registries')
  @ApiOperation({ summary: 'Créer une nouvelle configuration de registre' })
  async createRegistry(@Body() dto: CreateRegistryConfigDto) {
    return await this.platformConfigService.createRegistryConfig(dto);
  }

  @Put('registries/:id')
  @ApiOperation({ summary: 'Mettre à jour une configuration de registre' })
  async updateRegistry(
    @Param('id') id: string,
    @Body() dto: UpdateRegistryConfigDto,
  ) {
    return await this.platformConfigService.updateRegistryConfig(id, dto);
  }

  @Delete('registries/:id')
  @ApiOperation({ summary: 'Supprimer une configuration de registre' })
  async deleteRegistry(@Param('id') id: string) {
    await this.platformConfigService.deleteRegistryConfig(id);
    return { message: 'Registre supprimé avec succès' };
  }

  @Post('registries/:id/test')
  @ApiOperation({ summary: 'Tester la connexion à un registre' })
  async testRegistry(@Param('id') id: string) {
    return await this.platformConfigService.testRegistryConnection(id);
  }

  @Post('registries/:id/set-default')
  @ApiOperation({ summary: 'Définir un registre comme registre par défaut' })
  async setDefaultRegistry(@Param('id') id: string) {
    return await this.platformConfigService.setDefaultRegistryConfig(id);
  }

  private resolvePublicBaseUrl(req: Request): string {
    const forwardedProto = req.header('x-forwarded-proto');
    const forwardedHost = req.header('x-forwarded-host');

    const protocol =
      forwardedProto?.split(',')[0]?.trim() || req.protocol || 'http';
    const host = forwardedHost?.split(',')[0]?.trim() || req.get('host');

    if (!host) {
      throw new BadRequestException(
        'Host HTTP manquant pour construire callback',
      );
    }

    return `${protocol}://${host}`;
  }
}
