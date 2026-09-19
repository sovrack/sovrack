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
import { ManagedServerProvider } from '@prisma/client';
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { GetWorkspaceId } from '../../../../shared/decorators/get-workspace-id.decorator';
import { ServerWorkspaceGuard } from '../../../iam/authorization/server-workspace.guard';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { ManagedServersService } from '../services/managed-servers.service';
import { RequireServerAction } from '../../../iam/authorization/require-server-action.decorator';
import { WorkspaceActions } from '../../../iam/authorization/workspace-policy.types';
import { RequiresProductCapability } from '../../../../shared/product-capabilities/requires-product-capability.decorator';
import { ProductCapabilities } from '../../../../shared/product-capabilities/product-capability';

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
@Controller(['workspaces/:workspaceId/managed-servers', 'managed-servers'])
@UseGuards(ServerWorkspaceGuard)
@RequiresProductCapability(ProductCapabilities.MANAGED_INFRASTRUCTURE)
export class ManagedServersController {
  constructor(private readonly managed: ManagedServersService) {}

  @Post()
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({
    summary: 'Provisionner un serveur managé pour la team',
  })
  @ApiCreatedResponse({ description: 'Serveur managé créé' })
  async create(
    @Body() dto: CreateManagedServerDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return this.managed.create(
      { ...dto, provider: dto.provider },
      user.id,
      workspaceId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lister les serveurs managés de la team' })
  @ApiOkResponse({ description: 'Liste des serveurs managés' })
  async list(@GetWorkspaceId() workspaceId: string) {
    return this.managed.listManaged(workspaceId);
  }

  @Get('estimate')
  @ApiOperation({ summary: 'Coût mensuel estimé de l’infra managée' })
  async estimate(@GetWorkspaceId() workspaceId: string) {
    const aggregate = await this.managed.estimateMonthly(workspaceId);
    return {
      monthlyTotalMillimes: aggregate._sum.monthlyCostMillimes ?? 0,
    };
  }

  @Get(':id/public-key')
  @ApiOperation({ summary: 'Clé publique SSH du serveur managé' })
  async publicKey(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.managed.getPublicKey(id, workspaceId);
  }

  @Patch(':id/host')
  @RequireServerAction(WorkspaceActions.MANAGE_SERVER)
  @ApiOperation({
    summary:
      "Renseigner l'hôte réel (IP/hostname) du serveur managé après provisionnement — déclenche la vérification SSH puis la préparation",
  })
  async setHost(
    @Param('id') id: string,
    @Body() dto: SetManagedHostDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return this.managed.setHost(id, dto.host, workspaceId, user.id);
  }
}
