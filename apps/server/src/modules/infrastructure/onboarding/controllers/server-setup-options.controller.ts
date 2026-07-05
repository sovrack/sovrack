import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/guards/roles.guard';
import { ServerSetupService } from '../services/infra-setup.service';

@ApiTags('Server Preparation Options')
@ApiBearerAuth()
@Controller('server-setup-options')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerSetupOptionsController {
  constructor(private readonly prep: ServerSetupService) {}

  @Get()
  @ApiOperation({ summary: 'List provisioning options and profiles' })
  options() {
    return this.prep.getOptions();
  }
}
