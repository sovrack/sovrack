import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GetUser } from '../../../common/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { StartServerPreparationDto } from '../dto';
import {
  ServerPreparationDto,
  ServerPreparationReadinessDto,
} from '../dto/server-response.dto';
import { ServersCoreService } from '../services';

@ApiTags('Servers Preparation')
@ApiBearerAuth()
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerPreparationController {
  constructor(private readonly core: ServersCoreService) {}

  @Post(':id/preparations')
  @ApiOperation({ summary: 'Démarrer une préparation serveur' })
  @ApiCreatedResponse({ type: ServerPreparationDto })
  async startPreparation(
    @Param('id') id: string,
    @Body() dto: StartServerPreparationDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.core.startPreparation(id, dto, user.id);
  }

  @Get(':id/preparations')
  @ApiOperation({ summary: "Lister l'historique de préparation du serveur" })
  @ApiOkResponse({ type: ServerPreparationDto, isArray: true })
  async listPreparations(@Param('id') id: string) {
    return await this.core.listPreparations(id);
  }

  @Get(':id/preparation-readiness')
  @ApiOperation({
    summary:
      'Vérifier si le serveur est prêt à lancer une préparation (SSH/sudo/état/verrou).',
  })
  @ApiOkResponse({ type: ServerPreparationReadinessDto })
  async getPreparationReadiness(@Param('id') id: string) {
    return await this.core.getPreparationReadiness(id);
  }
}
