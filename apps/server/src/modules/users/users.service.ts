import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type UpdateActor = {
  id: string;
  role: Role;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recherche un utilisateur par email
   * @param email - Email de l'utilisateur
   * @returns User ou null si non trouvé
   */
  async findByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Recherche un utilisateur par ID
   * @param id - UUID de l'utilisateur
   * @returns User ou null si non trouvé
   */
  async findById(id: string): Promise<User | null> {
    return await this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Crée un nouvel utilisateur avec mot de passe hashé.
   */
  async create(dto: CreateUserDto): Promise<Omit<User, 'password'>> {
    const existingUser = await this.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        fullName: dto.fullName,
        role: dto.role ?? Role.DEVELOPER,
      },
    });

    return this.removePassword(user);
  }

  /**
   * Retourne tous les utilisateurs sans mot de passe.
   */
  async findAll(): Promise<Array<Omit<User, 'password'>>> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.removePassword(user));
  }

  /**
   * Retourne un utilisateur par id, ou lève une exception si absent.
   */
  async findByIdOrFail(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return this.removePassword(user);
  }

  /**
   * Met à jour un utilisateur existant.
   */
  async update(
    id: string,
    dto: UpdateUserDto,
    actor?: UpdateActor,
  ): Promise<Omit<User, 'password'>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const isAdminActor = actor?.role === Role.ADMIN;
    const isSelfUpdate = actor?.id === id;
    const hasActorContext = Boolean(actor);

    if (hasActorContext && !isAdminActor && !isSelfUpdate) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que votre propre profil',
      );
    }

    if (
      hasActorContext &&
      !isAdminActor &&
      (dto.role !== undefined || dto.isActive !== undefined)
    ) {
      throw new ForbiddenException(
        'Seul un administrateur peut modifier le rôle ou le statut actif',
      );
    }

    const wantsPasswordChange =
      dto.currentPassword !== undefined ||
      dto.newPassword !== undefined ||
      dto.confirmNewPassword !== undefined;

    const data: Prisma.UserUpdateInput = {};

    if (dto.fullName !== undefined) {
      data.fullName = dto.fullName;
    }

    if (!hasActorContext || isAdminActor) {
      if (dto.role !== undefined) {
        data.role = dto.role;
      }
      if (dto.isActive !== undefined) {
        data.isActive = dto.isActive;
      }
    }

    if (wantsPasswordChange) {
      if (!dto.currentPassword || !dto.newPassword || !dto.confirmNewPassword) {
        throw new BadRequestException(
          'Pour changer le mot de passe, renseignez mot de passe actuel, nouveau et confirmation',
        );
      }

      if (dto.newPassword !== dto.confirmNewPassword) {
        throw new BadRequestException(
          'La confirmation du nouveau mot de passe ne correspond pas',
        );
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        dto.currentPassword,
        user.password,
      );
      if (!isCurrentPasswordValid) {
        throw new UnauthorizedException('Mot de passe actuel incorrect');
      }

      data.password = await bcrypt.hash(dto.newPassword, 10);
    }

    if (Object.keys(data).length === 0) {
      return this.removePassword(user);
    }

    const updatedUser = await this.prisma.user.update({ where: { id }, data });
    return this.removePassword(updatedUser);
  }

  /**
   * Supprime un utilisateur.
   */
  async delete(id: string): Promise<Omit<User, 'password'>> {
    await this.ensureUserExists(id);

    const deletedUser = await this.prisma.user.delete({ where: { id } });
    return this.removePassword(deletedUser);
  }

  /**
   * Active ou désactive un utilisateur.
   */
  async toggleActive(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
    });

    return this.removePassword(updatedUser);
  }

  /**
   * Vérifie l'existence d'un utilisateur.
   */
  private async ensureUserExists(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
  }

  /**
   * Supprime le mot de passe d'un objet utilisateur.
   */
  private removePassword(user: User): Omit<User, 'password'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
