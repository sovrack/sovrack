import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { RetryServerPreparationDto } from '../../servers/dto';
import {
  ServerPreparationLogDto,
  ServerPreparationDto,
} from '../../servers/dto/server-response.dto';
import { ServerPreparationService } from '../services/infra-preparation.service';

@ApiTags('Server Preparations')
@ApiBearerAuth()
@Controller('preparations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerPreparationsController {
  constructor(private readonly prep: ServerPreparationService) {}

  @Get(':id')
  @ApiOperation({ summary: "View a server provisioning's details" })
  @ApiOkResponse({ type: ServerPreparationDto })
  async findOne(@Param('id') id: string) {
    return await this.prep.getPreparation(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Read the persisted logs of a provisioning job' })
  @ApiOkResponse({ type: ServerPreparationLogDto, isArray: true })
  async logs(@Param('id') id: string, @Query('afterLine') afterLine?: string) {
    return await this.prep.getPreparationLogs(
      id,
      afterLine ? Number(afterLine) : undefined,
    );
  }

  @Post(':id/retry')
  @ApiOperation({
    summary: 'Re-run a provisioning by creating a new linked job',
  })
  @ApiCreatedResponse({ type: ServerPreparationDto })
  async retry(
    @Param('id') id: string,
    @Body() dto: RetryServerPreparationDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.prep.retryPreparation(id, dto, user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a provisioning job if still active',
  })
  @ApiOkResponse({ type: ServerPreparationDto })
  async cancel(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.prep.cancelPreparation(id, user.id);
  }
}
