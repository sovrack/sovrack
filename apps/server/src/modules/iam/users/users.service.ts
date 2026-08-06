import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  PaginationDto,
  PaginatedResult,
  paginate,
} from '../../../shared/http/pagination.dto';
import { PasswordHasher } from '../security/password-hasher.service';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type UpdateActor = {
  id: string;
  role: Role;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

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
   * Multi-tenant : le nouvel utilisateur est rattaché à l'organisation
   * (les équipes) de l'acteur qui le crée.
   */
  async create(
    dto: CreateUserDto,
    actor?: { id: string; role: Role },
  ): Promise<Omit<User, 'password'>> {
    const existingUser = await this.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const hashedPassword = await this.passwordHasher.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        fullName: dto.fullName,
        role: dto.role ?? Role.MEMBER,
      },
    });

    if (actor) {
      const memberships = await this.prisma.teamMember.findMany({
        where: { userId: actor.id },
        select: { teamId: true },
      });
      if (memberships.length > 0) {
        await this.prisma.teamMember.createMany({
          data: memberships.map((m) => ({
            teamId: m.teamId,
            userId: user.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    this.logger.log(
      `User ${user.email} (${user.id}) created with role ${user.role}`,
    );

    return this.removePassword(user);
  }

  /**
   * Retourne tous les utilisateurs sans mot de passe.
   * Scoping multi-tenant : un OWNER/MEMBER ne voit que les membres de ses
   * propres équipes (son organisation). Seul un SUPER_ADMIN voit tout.
   */
  async findAll(
    pagination?: PaginationDto,
    actor?: { id: string; role: Role },
  ): Promise<
    Array<Omit<User, 'password'>> | PaginatedResult<Omit<User, 'password'>>
  > {
    const page = pagination?.page;
    const limit = pagination?.limit;
    const where = await this.orgScopeWhere(actor);

    if (page && limit) {
      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.user.count({ where }),
      ]);
      return paginate(
        users.map((u) => this.removePassword(u)),
        total,
        page,
        limit,
      );
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.removePassword(user));
  }

  /**
   * Filtre Prisma limitant un utilisateur aux membres de son organisation
   * (ses équipes).
   */
  private async orgScopeWhere(actor?: {
    id: string;
    role: Role;
  }): Promise<Prisma.UserWhereInput> {
    if (!actor) {
      return {};
    }
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId: actor.id },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);
    if (teamIds.length === 0) {
      return { id: actor.id };
    }
    return {
      teams: { some: { teamId: { in: teamIds } } },
    };
  }

  /**
   * Retourne un utilisateur par id, ou lève une exception si absent.
   * Multi-tenant : hors SUPER_ADMIN, on ne peut consulter que les membres
   * de sa propre organisation.
   */
  async findByIdOrFail(
    id: string,
    actor?: { id: string; role: Role },
  ): Promise<Omit<User, 'password'>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    if (actor) {
      await this.assertInSameOrg(id, actor);
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

    if (actor) {
      await this.assertInSameOrg(id, actor);
    }

    const isAdminActor = actor?.role === Role.OWNER;
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

      const isCurrentPasswordValid = await this.passwordHasher.verify(
        user.password,
        dto.currentPassword,
      );
      if (!isCurrentPasswordValid) {
        throw new UnauthorizedException('Mot de passe actuel incorrect');
      }

      data.password = await this.passwordHasher.hash(dto.newPassword);
    }

    if (Object.keys(data).length === 0) {
      return this.removePassword(user);
    }

    if (data.role !== undefined || data.isActive !== undefined) {
      // Log les valeurs depuis dto (typées Role/boolean simples) plutôt que
      // depuis `data` (dont le type Prisma est une union avec la forme objet
      // { set } → no-base-to-string). Équivalent : data.role provient de dto.role.
      const nextRole = dto.role ?? user.role;
      const nextActive = dto.isActive ?? user.isActive;
      this.logger.warn(
        `User ${id} updated by ${actor?.id ?? 'system'}: role=${nextRole}, isActive=${String(nextActive)}`,
      );
    }
    if (wantsPasswordChange) {
      this.logger.log(`User ${id} changed their password via profile update`);
    }

    const updatedUser = await this.prisma.user.update({ where: { id }, data });
    return this.removePassword(updatedUser);
  }

  async changeMyPassword(
    userId: string,
    dto: ChangeMyPasswordDto,
  ): Promise<Omit<User, 'password'>> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException(
        'La confirmation du nouveau mot de passe ne correspond pas',
      );
    }

    const isCurrentPasswordValid = await this.passwordHasher.verify(
      user.password,
      dto.currentPassword,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    const hashedPassword = await this.passwordHasher.hash(dto.newPassword);
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
    this.logger.log(`User ${userId} changed their password`);

    return this.removePassword(updatedUser);
  }

  /**
   * Supprime un utilisateur.
   * Multi-tenant : hors SUPER_ADMIN, uniquement les membres de sa propre org.
   */
  async delete(
    id: string,
    actor?: { id: string; role: Role },
  ): Promise<Omit<User, 'password'>> {
    await this.ensureUserExists(id);
    if (actor) {
      await this.assertInSameOrg(id, actor);
    }

    const deletedUser = await this.prisma.user.delete({ where: { id } });
    this.logger.warn(`User ${deletedUser.email} (${id}) deleted`);
    return this.removePassword(deletedUser);
  }

  /**
   * Active ou désactive un utilisateur.
   * Multi-tenant : hors SUPER_ADMIN, uniquement les membres de sa propre org.
   */
  async toggleActive(
    id: string,
    actor?: { id: string; role: Role },
  ): Promise<Omit<User, 'password'>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    if (actor) {
      await this.assertInSameOrg(id, actor);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
    });
    this.logger.warn(
      `User ${user.email} (${id}) ${updatedUser.isActive ? 'activated' : 'deactivated'}`,
    );

    return this.removePassword(updatedUser);
  }

  /**
   * Vérifie qu'un utilisateur cible appartient à la même organisation que
   * l'acteur (mêmes équipes).
   */
  private async assertInSameOrg(
    targetUserId: string,
    actor: { id: string; role: Role },
  ): Promise<void> {
    if (actor.id === targetUserId) {
      return;
    }
    const actorTeams = await this.prisma.teamMember.findMany({
      where: { userId: actor.id },
      select: { teamId: true },
    });
    const teamIds = actorTeams.map((m) => m.teamId);
    const sameTeam = teamIds.length
      ? await this.prisma.teamMember.findFirst({
          where: { userId: targetUserId, teamId: { in: teamIds } },
          select: { id: true },
        })
      : null;
    if (!sameTeam) {
      throw new ForbiddenException(
        "Vous ne pouvez pas interagir avec un membre d'une autre organisation",
      );
    }
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
