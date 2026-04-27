import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ServerPreparationService } from '../services';

@ApiTags('Server Preparation Options')
@ApiBearerAuth()
@Controller('server-preparation-options')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerPreparationOptionsController {
  constructor(private readonly preparations: ServerPreparationService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les options et profils de préparation' })
  options() {
    return this.preparations.getOptions();
  }
}
