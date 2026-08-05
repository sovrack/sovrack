import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
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
import { StartServerSetupDto } from '../../servers/dto';
import {
  ServerSetupDto,
  ServerSetupReadinessDto,
} from '../../servers/dto/server-response.dto';
import { ServerSetupService } from '../services/infra-setup.service';

@ApiTags('Servers Setup')
@ApiBearerAuth()
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MEMBER)
export class ServerSetupController {
  private readonly logger = new Logger(ServerSetupController.name);

  constructor(private readonly prep: ServerSetupService) {}

  @Post(':id/setups')
  @ApiOperation({ summary: 'Start a server provisioning job' })
  @ApiCreatedResponse({ type: ServerSetupDto })
  async startSetup(
    @Param('id') id: string,
    @Body() dto: StartServerSetupDto,
    @GetUser() user: JwtPayload,
  ) {
    try {
      return await this.prep.startSetup(id, dto, user.id);
    } catch (error) {
      // Re-throw NestJS HTTP exceptions (BadRequest, NotFound, etc.) directly
      if (
        error instanceof Error &&
        'getStatus' in error &&
        typeof (error as { getStatus: () => number }).getStatus === 'function'
      ) {
        throw error;
      }
      // Log internal errors server-side, return clean message to client
      this.logger.error(
        `Failed to start setup for server ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Setup could not be started. Check server readiness or backend logs.',
      );
    }
  }

  @Get(':id/setups')
  @ApiOperation({ summary: "List the server's provisioning history" })
  @ApiOkResponse({ type: ServerSetupDto, isArray: true })
  async listSetups(@Param('id') id: string) {
    return await this.prep.listSetups(id);
  }

  @Get(':id/setup-readiness')
  @ApiOperation({
    summary:
      'Check whether the server is ready to start provisioning (SSH/sudo/state/lock).',
  })
  @ApiOkResponse({ type: ServerSetupReadinessDto })
  async getSetupReadiness(@Param('id') id: string) {
    return await this.prep.getSetupReadiness(id);
  }
}
