import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Role, ServerInfraRole } from '@prisma/client';
import { Roles } from '../../../core/decorators/roles.decorator';
import { GetUser } from '../../../core/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import type { JwtPayload } from '../../../core/jwt/dto/jwt-payload.dto';
import { PaginationDto } from '../../../core/http/pagination.dto';
import { CreateServerDto } from '../dto/create-server.dto';
import {
  CreateServerResponseDto,
  DeleteServerResponseDto,
  InstallKeyResponseDto,
  PaginatedServerJobsResponseDto,
  PaginatedServersResponseDto,
  ServerActiveJobDto,
  ServerJobResponseDto,
  ServerResponseDto,
} from '../dto/server-response.dto';
import { UpdateServerDto } from '../dto/update-server.dto';
import { ServersCoreService } from '../services';

class SetServerRoleDto {
  @IsEnum(ServerInfraRole, { message: 'Rôle invalide' })
  @IsNotEmpty()
  infraRole!: ServerInfraRole;
}

class RegisterRunnerDto {
  @IsString({ message: "L'URL GitLab doit être une chaîne de caractères" })
  @IsNotEmpty({ message: 'gitlabUrl est obligatoire' })
  gitlabUrl!: string;

  @IsString({ message: 'Le token doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'token est obligatoire' })
  token!: string;
}

class InstallKeyDto {
  @ApiProperty({ example: 'temporary-ssh-password' })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'password est obligatoire' })
  password!: string;
}

@ApiTags('Servers Management')
@ApiBearerAuth()
@ApiExtraModels(
  ServerResponseDto,
  ServerActiveJobDto,
  CreateServerResponseDto,
  PaginatedServersResponseDto,
  PaginatedServerJobsResponseDto,
  ServerJobResponseDto,
  DeleteServerResponseDto,
  InstallKeyResponseDto,
)
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServerManagementController {
  constructor(private readonly core: ServersCoreService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un serveur' })
  @ApiCreatedResponse({
    description: 'Serveur créé avec succès',
    type: CreateServerResponseDto,
  })
  async create(@Body() dto: CreateServerDto, @GetUser() user: JwtPayload) {
    return await this.core.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les serveurs (sshKey masquée)' })
  @ApiOkResponse({
    description: 'Liste des serveurs',
    schema: {
      oneOf: [
        {
          type: 'array',
          items: { $ref: getSchemaPath(ServerResponseDto) },
        },
        { $ref: getSchemaPath(PaginatedServersResponseDto) },
      ],
    },
  })
  async findAll(@Query() pagination: PaginationDto) {
    return await this.core.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: "Voir le détail d'un serveur" })
  @ApiOkResponse({ description: 'Serveur trouvé', type: ServerResponseDto })
  async findOne(@Param('id') id: string) {
    return await this.core.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier un serveur' })
  @ApiOkResponse({ description: 'Serveur mis à jour', type: ServerResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateServerDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.core.update(id, dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier partiellement un serveur' })
  @ApiOkResponse({ description: 'Serveur mis à jour', type: ServerResponseDto })
  async patch(
    @Param('id') id: string,
    @Body() dto: UpdateServerDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.core.update(id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Supprimer un serveur si aucun environnement actif',
  })
  @ApiOkResponse({
    description: 'Serveur supprimé',
    type: DeleteServerResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Serveur utilisé par un environnement actif',
  })
  async remove(@Param('id') id: string, @GetUser() user: JwtPayload) {
    await this.core.remove(id, user.id);
    return { message: 'Serveur supprimé avec succès' };
  }

  @Post(':id/install-key')
  @ApiOperation({
    summary: 'Installer la clé publique SSH via mot de passe temporaire',
  })
  @ApiCreatedResponse({
    description: 'Clé SSH installée et validée',
    type: InstallKeyResponseDto,
  })
  async installKey(
    @Param('id') id: string,
    @Body() dto: InstallKeyDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.core.installPublicKey(id, dto.password, user.id);
  }

  @Post(':id/register-runner')
  @ApiOperation({ summary: 'Enregistrer le GitLab Runner sur ce serveur' })
  @ApiCreatedResponse({
    description: 'Runner enregistré',
    type: ServerResponseDto,
  })
  async registerRunner(
    @Param('id') id: string,
    @Body() dto: RegisterRunnerDto,
  ) {
    return await this.core.registerRunner(id, dto.gitlabUrl, dto.token);
  }

  @Get(':id/jobs')
  @ApiOperation({ summary: "Lister l'historique des jobs serveur" })
  @ApiOkResponse({
    description: 'Liste des jobs serveur',
    schema: {
      oneOf: [
        {
          type: 'array',
          items: { $ref: getSchemaPath(ServerJobResponseDto) },
        },
        { $ref: getSchemaPath(PaginatedServerJobsResponseDto) },
      ],
    },
  })
  async listJobs(@Param('id') id: string, @Query() pagination: PaginationDto) {
    return await this.core.listJobs(id, pagination);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Définir le rôle infrastructure de ce serveur' })
  @ApiOkResponse({ description: 'Rôle mis à jour' })
  async setServerRole(
    @Param('id') id: string,
    @Body() dto: SetServerRoleDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.core.setServerInfraRole(id, dto.infraRole, user.id);
  }

  @Get('infra-environments')
  @ApiOperation({ summary: 'Lister les serveurs configurés comme STAGING ou PRODUCTION' })
  @ApiOkResponse({ description: 'Serveurs avec rôle infra' })
  async listInfraEnvironments() {
    return await this.core.listInfraEnvironments();
  }

  @Get(':id/environments')
  @ApiOperation({ summary: 'Lister les environnements assignés à ce serveur (tous projets)' })
  @ApiOkResponse({ description: 'Environnements utilisant ce serveur' })
  async listServerEnvironments(@Param('id') id: string) {
    return await this.core.listEnvironmentsForServer(id);
  }

  @Post(':id/ping')
  @ApiOperation({ summary: 'Tester rapidement la connectivité SSH du serveur' })
  @ApiOkResponse({ description: 'Résultat du test de connexion' })
  async pingServer(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.core.pingServer(id, user.id);
  }

  @Post(':id/jobs/:jobId/cancel')
  @ApiOperation({ summary: 'Forcer la fin d\'un job bloqué ou fantôme' })
  @ApiOkResponse({ description: 'Job marqué comme échoué', type: ServerJobResponseDto })
  async cancelJob(@Param('id') id: string, @Param('jobId') jobId: string) {
    return await this.core.cancelJob(id, jobId);
  }
}
