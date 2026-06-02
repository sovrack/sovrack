import {
  Body,
  Controller,
  Get,
  Param,
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
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { PlatformService } from './platform.service';

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
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  @ApiOperation({ summary: 'Lister toutes les configurations globales' })
  @ApiResponse({ status: 200, description: 'Liste retournée (secrets masqués)' })
  async getAll() {
    return this.platform.getAll();
  }

  @Put(':key')
  @ApiOperation({ summary: 'Mettre à jour une configuration globale' })
  @ApiResponse({ status: 200, description: 'Configuration mise à jour' })
  async setConfig(@Param('key') key: string, @Body() dto: UpdatePlatformConfigDto) {
    return this.platform.set(key, dto.value, dto.isSecret);
  }
}
