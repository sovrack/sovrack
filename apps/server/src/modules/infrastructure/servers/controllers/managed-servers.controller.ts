import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ManagedServerProvider, Role } from '@prisma/client';
import { Roles } from '../../../../shared/decorators/roles.decorator';
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/guards/roles.guard';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { ManagedServersService } from '../services/managed-servers.service';

class CreateManagedServerDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  name!: string;

  @IsEnum(ManagedServerProvider, { message: 'Provider invalide' })
  provider!: ManagedServerProvider;

  @IsOptional()
  @IsString()
  serverSize?: string;
}

class SetManagedHostDto {
  @IsString()
  @IsNotEmpty({ message: "L'hôte (IP ou hostname) est obligatoire" })
  host!: string;
}

/**
 * Serveurs managés Sovrack — hôtes provisionnés et gérés par la plateforme.
 * Accessible à toute la team (l'usage est gardé par plan, la team est résolue
 * depuis l'utilisateur connecté).
 */
@ApiTags('Managed Servers')
@ApiBearerAuth()
@Controller('managed-servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DEVELOPER)
export class ManagedServersController {
  constructor(private readonly managed: ManagedServersService) {}

  @Post()
  @ApiOperation({
    summary: 'Provisionner un serveur managé pour la team',
  })
  @ApiCreatedResponse({ description: 'Serveur managé créé' })
  async create(
    @Body() dto: CreateManagedServerDto,
    @GetUser() user: JwtPayload,
  ) {
    return this.managed.create({ ...dto, provider: dto.provider }, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les serveurs managés de la team' })
  @ApiOkResponse({ description: 'Liste des serveurs managés' })
  async list(@GetUser() user: JwtPayload) {
    const teamId = await this.managed.getTeamId(user.id);
    return this.managed.listManaged(teamId);
  }

  @Get('estimate')
  @ApiOperation({ summary: 'Coût mensuel estimé de l’infra managée' })
  async estimate(@GetUser() user: JwtPayload) {
    const teamId = await this.managed.getTeamId(user.id);
    const aggregate = await this.managed.estimateMonthly(teamId);
    return {
      monthlyTotalMillimes: aggregate._sum.monthlyCostMillimes ?? 0,
    };
  }

  @Get(':id/public-key')
  @ApiOperation({ summary: 'Clé publique SSH du serveur managé' })
  async publicKey(@Param('id') id: string, @GetUser() user: JwtPayload) {
    const teamId = await this.managed.getTeamId(user.id);
    return this.managed.getPublicKey(id, teamId);
  }

  @Patch(':id/host')
  @ApiOperation({
    summary:
      "Renseigner l'hôte réel (IP/hostname) du serveur managé après provisionnement — déclenche la vérification SSH puis la préparation",
  })
  async setHost(
    @Param('id') id: string,
    @Body() dto: SetManagedHostDto,
    @GetUser() user: JwtPayload,
  ) {
    const teamId = await this.managed.getTeamId(user.id);
    return this.managed.setHost(id, dto.host, teamId, user.id);
  }
}
