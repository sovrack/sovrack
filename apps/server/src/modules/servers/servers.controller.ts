import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
  ApiProperty,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateServerDto } from './dto/create-server.dto';
import {
  CreateServerResponseDto,
  DeleteServerResponseDto,
  InstallKeyResponseDto,
  PaginatedServerJobsResponseDto,
  PaginatedServersResponseDto,
  ServerJobResponseDto,
  ServerResponseDto,
  ServerVerificationStatusDto,
  VerifyServerResponseDto,
  ServerLogDto,
} from './dto/server-response.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { InstallToolsDto } from './dto/install-tools.dto';
import { ServerVerificationService, ServersCoreService } from './services';

class RegisterRunnerDto {
  @ApiProperty({ example: 'https://gitlab.example.com' })
  @IsString({ message: "L'URL GitLab doit être une chaîne de caractères" })
  @IsNotEmpty({ message: 'gitlabUrl est obligatoire' })
  gitlabUrl!: string;

  @ApiProperty({ example: 'GR1345xyz' })
  @IsString({ message: 'Le token doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'token est obligatoire' })
  token!: string;
}

class InstallKeyDto {
  @ApiProperty({ example: 'MyTempPassword123!' })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'password est obligatoire' })
  password!: string;
}

@ApiTags('Servers')
@ApiBearerAuth()
@ApiExtraModels(
  ServerResponseDto,
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
export class ServersController {
  constructor(
    private readonly core: ServersCoreService,
    private readonly verification: ServerVerificationService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Créer un serveur (onboarding SSH: installation de clé via mot de passe temporaire, puis vérification)',
  })
  @ApiCreatedResponse({
    description: 'Serveur créé avec succès',
    type: CreateServerResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
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
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  async findAll(@Query() pagination: PaginationDto) {
    return await this.core.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: "Voir le détail d'un serveur" })
  @ApiOkResponse({ description: 'Serveur trouvé', type: ServerResponseDto })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async findOne(@Param('id') id: string) {
    return await this.core.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier un serveur' })
  @ApiOkResponse({
    description: 'Serveur mis à jour',
    type: ServerResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async update(
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
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async remove(@Param('id') id: string, @GetUser() user: JwtPayload) {
    await this.core.remove(id, user.id);
    return { message: 'Serveur supprimé avec succès' };
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Vérifier SSH, Docker, Ansible et GitLab Runner' })
  @ApiCreatedResponse({
    description: 'Vérification serveur terminée',
    type: ServerResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Connexion SSH ou vérification échouée',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async verify(@Param('id') id: string) {
    return await this.core.verifyServer(id);
  }

  @Post(':id/install')
  @ApiOperation({
    summary: 'Installer les outils manquants sur le serveur cible',
  })
  @ApiCreatedResponse({
    description: 'Installation terminée',
    type: ServerResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Installation distante échouée' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async install(@Param('id') id: string, @Body() dto: InstallToolsDto) {
    return await this.core.installTools(id, dto);
  }

  @Post(':id/register-runner')
  @ApiOperation({ summary: 'Enregistrer le GitLab Runner sur ce serveur' })
  @ApiCreatedResponse({
    description: 'Runner enregistré',
    type: ServerResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Échec enregistrement runner' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async registerRunner(
    @Param('id') id: string,
    @Body() dto: RegisterRunnerDto,
  ) {
    return await this.core.registerRunner(id, dto.gitlabUrl, dto.token);
  }

  @Post(':id/install-key')
  @ApiOperation({
    summary: 'Installer la clé publique SSH via mot de passe temporaire',
  })
  @ApiCreatedResponse({
    description: 'Clé SSH installée et validée',
    type: InstallKeyResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Installation de clé impossible pour ce serveur',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async installKey(@Param('id') id: string, @Body() dto: InstallKeyDto) {
    return await this.core.installPublicKey(id, dto.password);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Récupérer le statut de vérification du serveur' })
  @ApiOkResponse({
    description: 'Statut de vérification du serveur',
    type: ServerVerificationStatusDto,
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async getVerificationStatus(@Param('id') id: string) {
    const server = await this.core.findOne(id);
    const recentLogs = await this.verification.getRecentLogs(id, 10);

    return {
      id: server.id,
      name: server.name,
      status: server.status,
      verificationError: server.verificationError,
      lastVerifiedAt: server.lastVerifiedAt,
      isVerified: server.isVerified,
      hasDocker: server.hasDocker,
      hasAnsible: server.hasAnsible,
      hasRunner: server.hasRunner,
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        serverId: log.serverId,
        message: log.message,
        level: log.level,
        context: log.context,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Récupérer les logs de vérification du serveur' })
  @ApiOkResponse({
    description: 'Logs de vérification du serveur',
    type: ServerLogDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async getVerificationLogs(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    await this.core.findOne(id);
    const logs = await this.verification.getRecentLogs(
      id,
      limit ? parseInt(limit, 10) : 50,
    );

    return logs.map((log) => ({
      id: log.id,
      serverId: log.serverId,
      message: log.message,
      level: log.level,
      context: log.context,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  @Post(':id/retry-verification')
  @ApiOperation({ summary: 'Relancer la vérification du serveur' })
  @ApiCreatedResponse({
    description: 'Vérification relancée',
    type: VerifyServerResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async retryVerification(@Param('id') id: string) {
    await this.verification.resetStatus(id);
    const result = await this.core.verifyServer(id);

    return {
      serverId: id,
      message: 'Verification started, check status endpoint for updates',
      status: result.status,
    };
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
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async listJobs(@Param('id') id: string, @Query() pagination: PaginationDto) {
    return await this.core.listJobs(id, pagination);
  }

  @Post(':id/jobs/:jobId/retry')
  @ApiOperation({ summary: 'Relancer un job serveur' })
  @ApiCreatedResponse({
    description: 'Job relancé',
    type: ServerResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Job non rejouable' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur ou job non trouvé' })
  async retryJob(@Param('id') id: string, @Param('jobId') jobId: string) {
    return await this.core.retryJob(id, jobId);
  }
}
