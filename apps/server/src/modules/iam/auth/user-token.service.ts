import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { UsersService } from '../users/users.service';
import { type SafeUser, toSafeUser } from '../users/user-safe-view';

type TokenIdentity = Pick<User, 'id' | 'email' | 'sessionVersion'>;

/** Creates customer tokens from the current database identity state. */
@Injectable()
export class UserTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  generateAccessToken(user: TokenIdentity): string {
    return this.jwtService.sign({
      id: user.id,
      email: user.email,
      role: Role.MEMBER,
      sessionVersion: user.sessionVersion,
    });
  }

  generateWsToken(
    userId: string,
    email: string,
    sessionVersion: number,
  ): string {
    return this.jwtService.sign(
      {
        id: userId,
        sub: userId,
        email,
        role: Role.MEMBER,
        sessionVersion,
        authType: 'user' as const,
      },
      { expiresIn: '5m' },
    );
  }

  async generateTokenForUserId(
    userId: string,
  ): Promise<{ access_token: string; user: SafeUser }> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive || user.legacyStaffRetiredAt) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }
    const access_token = this.generateAccessToken(user);
    await this.auditService.record(
      user.id,
      'AUTH_GOOGLE_LOGIN',
      'User',
      user.id,
      { email: user.email },
    );
    return { access_token, user: toSafeUser(user) };
  }
}
