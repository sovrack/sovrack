import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role, RegistryProviderType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { RegistriesService } from './registries.service';

class CreateRegistryConfigDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsEnum(RegistryProviderType) @IsNotEmpty() type!: RegistryProviderType;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() registryUrl?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isDefault?: boolean;
}

class UpdateRegistryConfigDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(RegistryProviderType) type?: RegistryProviderType;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() registryUrl?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isDefault?: boolean;
}

@ApiTags('Registries (Admin)')
@ApiBearerAuth()
@Controller('admin/platform-config/registries')
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegistriesController {
  constructor(private readonly registries: RegistriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les configurations de registre' })
  async listRegistries() {
    return this.registries.listRegistryConfigs();
  }

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle configuration de registre' })
  async createRegistry(@Body() dto: CreateRegistryConfigDto) {
    return this.registries.createRegistryConfig(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour une configuration de registre' })
  async updateRegistry(@Param('id') id: string, @Body() dto: UpdateRegistryConfigDto) {
    return this.registries.updateRegistryConfig(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une configuration de registre' })
  async deleteRegistry(@Param('id') id: string) {
    await this.registries.deleteRegistryConfig(id);
    return { message: 'Registre supprimé avec succès' };
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Tester la connexion à un registre' })
  async testRegistry(@Param('id') id: string) {
    return this.registries.testRegistryConnection(id);
  }

  @Post(':id/set-default')
  @ApiOperation({ summary: 'Définir un registre comme registre par défaut' })
  async setDefaultRegistry(@Param('id') id: string) {
    return this.registries.setDefaultRegistryConfig(id);
  }
}
