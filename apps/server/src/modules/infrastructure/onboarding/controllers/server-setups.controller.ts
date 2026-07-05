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
import { Roles } from '../../../../shared/decorators/roles.decorator';
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/guards/roles.guard';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { RetryServerSetupDto } from '../../servers/dto';
import {
  ServerSetupLogDto,
  ServerSetupDto,
} from '../../servers/dto/server-response.dto';
import { ServerSetupService } from '../services/infra-setup.service';

@ApiTags('Server Preparations')
@ApiBearerAuth()
@Controller('setups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerSetupsController {
  constructor(private readonly prep: ServerSetupService) {}

  @Get(':id')
  @ApiOperation({ summary: "View a server provisioning's details" })
  @ApiOkResponse({ type: ServerSetupDto })
  async findOne(@Param('id') id: string) {
    return await this.prep.getPreparation(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Read the persisted logs of a provisioning job' })
  @ApiOkResponse({ type: ServerSetupLogDto, isArray: true })
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
  @ApiCreatedResponse({ type: ServerSetupDto })
  async retry(
    @Param('id') id: string,
    @Body() dto: RetryServerSetupDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.prep.retryPreparation(id, dto, user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a provisioning job if still active',
  })
  @ApiOkResponse({ type: ServerSetupDto })
  async cancel(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.prep.cancelPreparation(id, user.id);
  }
}
