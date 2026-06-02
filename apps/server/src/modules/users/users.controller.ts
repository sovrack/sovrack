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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { GetUser } from '../../core/decorators/get-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import type { JwtPayload } from '../../core/jwt/dto/jwt-payload.dto';
import { PaginationDto } from '../../core/http/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/**
 * Contrôleur de gestion des utilisateurs (réservé aux admins).
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau compte développeur' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  async create(@Body() dto: CreateUserDto): Promise<Omit<User, 'password'>> {
    return await this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les utilisateurs sans mot de passe' })
  @ApiResponse({ status: 200, description: 'Liste des utilisateurs' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant' })
  async findAll(@Query() pagination: PaginationDto) {
    return await this.usersService.findAll(pagination);
  }

  @Put('me/password')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({
    summary: 'Changer le mot de passe de la session courante',
  })
  @ApiResponse({ status: 200, description: 'Mot de passe mis à jour' })
  @ApiResponse({ status: 400, description: 'Payload invalide' })
  @ApiResponse({
    status: 401,
    description: 'Token JWT invalide/expiré ou mot de passe actuel incorrect',
  })
  async changeMyPassword(
    @GetUser() user: JwtPayload,
    @Body() dto: ChangeMyPasswordDto,
  ): Promise<Omit<User, 'password'>> {
    return await this.usersService.changeMyPassword(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: "Récupérer le détail d'un utilisateur" })
  @ApiResponse({ status: 200, description: 'Utilisateur trouvé' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant' })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouvé' })
  async findById(@Param('id') id: string): Promise<Omit<User, 'password'>> {
    return await this.usersService.findByIdOrFail(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Modifier un utilisateur' })
  @ApiResponse({ status: 200, description: 'Utilisateur mis à jour' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant' })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouvé' })
  async update(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: UpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    return await this.usersService.update(id, dto, {
      id: user.id,
      role: user.role,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un utilisateur' })
  @ApiResponse({ status: 200, description: 'Utilisateur supprimé' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant' })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouvé' })
  async delete(@Param('id') id: string): Promise<Omit<User, 'password'>> {
    return await this.usersService.delete(id);
  }

  @Put(':id/toggle-active')
  @ApiOperation({ summary: 'Activer ou désactiver un compte utilisateur' })
  @ApiResponse({ status: 200, description: 'Statut du compte mis à jour' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant' })
  @ApiResponse({ status: 404, description: 'Utilisateur non trouvé' })
  async toggleActive(@Param('id') id: string): Promise<Omit<User, 'password'>> {
    return await this.usersService.toggleActive(id);
  }
}
