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
import { RegistryProviderType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { GetWorkspaceId } from '../../shared/decorators/get-workspace-id.decorator';
import { WorkspaceGuard } from '../iam/authorization/workspace.guard';
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
@Controller([
  'workspaces/:workspaceId/integrations/registries',
  'admin/platform-config/registries',
])
@UseGuards(WorkspaceGuard)
export class ContainerRegistriesController {
  constructor(private readonly registries: ContainerRegistriesService) {}

  @Get()
  @ApiOperation({ summary: 'List registry configurations' })
  async listContainerRegistries(@GetWorkspaceId() workspaceId: string) {
    return this.registries.listRegistryConfigs(workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new registry configuration' })
  async createRegistry(
    @Body() dto: CreateRegistryConfigDto,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.registries.createRegistryConfig(dto, workspaceId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a registry configuration' })
  async updateRegistry(
    @Param('id') id: string,
    @Body() dto: UpdateRegistryConfigDto,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.registries.updateRegistryConfig(id, dto, workspaceId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a registry configuration' })
  async deleteRegistry(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    await this.registries.deleteRegistryConfig(id, workspaceId);
    return { message: 'Registre supprimé avec succès' };
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test the connection to a registry' })
  async testRegistry(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.registries.testRegistryConnection(id, workspaceId);
  }

  @Post(':id/set-default')
  @ApiOperation({ summary: 'Set a registry as the default registry' })
  async setDefaultRegistry(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.registries.setDefaultRegistryConfig(id, workspaceId);
  }
}
