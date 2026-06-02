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
import { Roles } from '../../../core/decorators/roles.decorator';
import { GetUser } from '../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import type { JwtPayload } from '../../../core/jwt/dto/jwt-payload.dto';
import { RetryServerPreparationDto } from '../dto';
import {
  ServerPreparationLogDto,
  ServerPreparationDto,
} from '../dto/server-response.dto';
import { ServersCoreService } from '../services';

@ApiTags('Server Preparations')
@ApiBearerAuth()
@Controller('preparations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerPreparationsController {
  constructor(private readonly core: ServersCoreService) {}

  @Get(':id')
  @ApiOperation({ summary: "Voir le détail d'une préparation serveur" })
  @ApiOkResponse({ type: ServerPreparationDto })
  async findOne(@Param('id') id: string) {
    return await this.core.getPreparation(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: "Lire les logs persistés d'une préparation" })
  @ApiOkResponse({ type: ServerPreparationLogDto, isArray: true })
  async logs(@Param('id') id: string, @Query('afterLine') afterLine?: string) {
    return await this.core.getPreparationLogs(
      id,
      afterLine ? Number(afterLine) : undefined,
    );
  }

  @Post(':id/retry')
  @ApiOperation({
    summary: 'Relancer une préparation en créant un nouveau job lié',
  })
  @ApiCreatedResponse({ type: ServerPreparationDto })
  async retry(
    @Param('id') id: string,
    @Body() dto: RetryServerPreparationDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.core.retryPreparation(id, dto, user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Annuler une préparation si elle est encore active',
  })
  @ApiOkResponse({ type: ServerPreparationDto })
  async cancel(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.core.cancelPreparation(id, user.id);
  }
}
