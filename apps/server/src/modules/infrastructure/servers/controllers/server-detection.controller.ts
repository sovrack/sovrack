import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../../core/decorators/roles.decorator';
import { GetUser } from '../../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../core/guards/roles.guard';
import type { JwtPayload } from '../../../../core/jwt/dto/jwt-payload.dto';
import { DetectServerDto } from '../dto';
import {
  ServerCapabilityDto,
  ServerInstalledToolDto,
  ServerResponseDto,
} from '../dto/server-response.dto';
import { ServersCoreService } from '../services';

@ApiTags('Servers Detection')
@ApiBearerAuth()
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerDetectionController {
  constructor(private readonly core: ServersCoreService) {}

  @Post(':id/detect')
  @ApiOperation({
    summary: 'Detect system info and installed tools',
  })
  @ApiCreatedResponse({
    description: 'Detection complete',
    type: ServerResponseDto,
  })
  async detect(
    @Param('id') id: string,
    @Body() dto: DetectServerDto,
    @GetUser() user: JwtPayload,
  ) {
    void dto;
    return await this.core.detectServer(id, user.id);
  }

  @Get(':id/capabilities')
  @ApiOperation({ summary: 'List the detected server capabilities' })
  @ApiOkResponse({ type: ServerCapabilityDto, isArray: true })
  async getCapabilities(@Param('id') id: string) {
    return await this.core.listCapabilities(id);
  }

  @Get(':id/installed-tools')
  @ApiOperation({ summary: 'List detected installed tools' })
  @ApiOkResponse({ type: ServerInstalledToolDto, isArray: true })
  async getInstalledTools(@Param('id') id: string) {
    return await this.core.listInstalledTools(id);
  }
}
