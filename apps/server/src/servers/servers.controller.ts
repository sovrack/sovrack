import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { ServersService } from './servers.service';

class InstallToolsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  docker?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ansible?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runner?: boolean;
}

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

@ApiTags('Servers')
@ApiBearerAuth()
@Controller('servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un serveur et lancer sa vérification' })
  @ApiResponse({ status: 201, description: 'Serveur créé avec succès' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  async create(@Body() dto: CreateServerDto) {
    return await this.serversService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les serveurs (sshKey masquée)' })
  @ApiResponse({ status: 200, description: 'Liste des serveurs' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  async findAll() {
    return await this.serversService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: "Voir le détail d'un serveur" })
  @ApiResponse({ status: 200, description: 'Serveur trouvé' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async findOne(@Param('id') id: string) {
    return await this.serversService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifier un serveur' })
  @ApiResponse({ status: 200, description: 'Serveur mis à jour' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async update(@Param('id') id: string, @Body() dto: UpdateServerDto) {
    return await this.serversService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Supprimer un serveur si aucun environnement actif',
  })
  @ApiResponse({ status: 200, description: 'Serveur supprimé' })
  @ApiResponse({
    status: 400,
    description: 'Serveur utilisé par un environnement actif',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async remove(@Param('id') id: string) {
    await this.serversService.remove(id);
    return { message: 'Serveur supprimé avec succès' };
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Vérifier SSH, Docker, Ansible et GitLab Runner' })
  @ApiResponse({ status: 201, description: 'Vérification serveur terminée' })
  @ApiResponse({
    status: 400,
    description: 'Connexion SSH ou vérification échouée',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async verify(@Param('id') id: string) {
    return await this.serversService.verifyServer(id);
  }

  @Post(':id/install')
  @ApiOperation({
    summary: 'Installer les outils manquants sur le serveur cible',
  })
  @ApiResponse({ status: 201, description: 'Installation terminée' })
  @ApiResponse({ status: 400, description: 'Installation distante échouée' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async install(@Param('id') id: string, @Body() dto: InstallToolsDto) {
    return await this.serversService.installTools(id, dto);
  }

  @Post(':id/register-runner')
  @ApiOperation({ summary: 'Enregistrer le GitLab Runner sur ce serveur' })
  @ApiResponse({ status: 201, description: 'Runner enregistré' })
  @ApiResponse({ status: 400, description: 'Échec enregistrement runner' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Accès réservé aux ADMIN' })
  @ApiResponse({ status: 404, description: 'Serveur non trouvé' })
  async registerRunner(
    @Param('id') id: string,
    @Body() dto: RegisterRunnerDto,
  ) {
    return await this.serversService.registerRunner(
      id,
      dto.gitlabUrl,
      dto.token,
    );
  }
}
