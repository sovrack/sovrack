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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, RegistryProviderType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { ContainerRegistriesService } from './container-registries.service';

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

@ApiTags('ContainerRegistries (Admin)')
@ApiBearerAuth()
@Controller('admin/platform-config/registries')
@Roles(Role.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContainerRegistriesController {
  constructor(private readonly registries: ContainerRegistriesService) {}

  @Get()
  @ApiOperation({ summary: 'List registry configurations' })
  async listContainerRegistries() {
    return this.registries.listRegistryConfigs();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new registry configuration' })
  async createRegistry(@Body() dto: CreateRegistryConfigDto) {
    return this.registries.createRegistryConfig(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a registry configuration' })
  async updateRegistry(
    @Param('id') id: string,
    @Body() dto: UpdateRegistryConfigDto,
  ) {
    return this.registries.updateRegistryConfig(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a registry configuration' })
  async deleteRegistry(@Param('id') id: string) {
    await this.registries.deleteRegistryConfig(id);
    return { message: 'Registre supprimé avec succès' };
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test the connection to a registry' })
  async testRegistry(@Param('id') id: string) {
    return this.registries.testRegistryConnection(id);
  }

  @Post(':id/set-default')
  @ApiOperation({ summary: 'Set a registry as the default registry' })
  async setDefaultRegistry(@Param('id') id: string) {
    return this.registries.setDefaultRegistryConfig(id);
  }
}
