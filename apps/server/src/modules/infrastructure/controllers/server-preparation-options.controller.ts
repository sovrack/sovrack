import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { ServerPreparationService } from '../services/infra-preparation.service';

@ApiTags('Server Preparation Options')
@ApiBearerAuth()
@Controller('server-preparation-options')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerPreparationOptionsController {
  constructor(private readonly prep: ServerPreparationService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les options et profils de préparation' })
  options() {
    return this.prep.getOptions();
  }
}
