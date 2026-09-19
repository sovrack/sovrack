import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PasswordHasher } from '../security/password-hasher.service';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import { type SafeUser, toSafeUser } from './user-safe-view';

/**
 * Identity self-service only.
 *
 * Global identities deliberately have no administrative CRUD here. Member
 * administration belongs to workspace memberships, and platform
 * administration belongs to the isolated Staff model.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async changeMyPassword(
    userId: string,
    dto: ChangeMyPasswordDto,
  ): Promise<SafeUser> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException(
        'La confirmation du nouveau mot de passe ne correspond pas',
      );
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'Ce compte est connecté via Google, il n’a pas de mot de passe à changer.',
      );
    }

    const isCurrentPasswordValid = await this.passwordHasher.verify(
      user.password,
      dto.currentPassword,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await this.passwordHasher.hash(dto.newPassword),
        sessionVersion: { increment: 1 },
      },
    });
    this.logger.log(`User ${userId} changed their password`);
    return toSafeUser(updatedUser);
  }
}
