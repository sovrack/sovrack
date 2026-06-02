import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { ServersCoreService } from '../services';

@ApiTags('Server Preparation Options')
@ApiBearerAuth()
@Controller('server-preparation-options')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerPreparationOptionsController {
  constructor(private readonly core: ServersCoreService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les options et profils de préparation' })
  options() {
    return this.core.getPreparationOptions();
  }
}
