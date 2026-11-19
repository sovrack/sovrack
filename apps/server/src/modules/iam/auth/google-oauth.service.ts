import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Role, User, WorkspaceType } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { TeamsService } from '../teams/teams.service';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../../shared/database/prisma.service';

export interface GoogleProfileUser {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
}

/**
 * Service "Se connecter avec Google" (OAuth 2.0).
 * Trouve ou crée l'utilisateur à partir du profil Google, applique l'onboarding
 * (team + abonnement) si c'est un premier login, et le retourne pour que le
 * contrôleur puisse émettre le JWT et poser le cookie de session.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Trouve ou crée l'utilisateur associé au profil Google.
   * @returns L'utilisateur complet (avec hash password éventuel, ignoré ici).
   */
  async findOrCreateUser(profile: GoogleProfileUser): Promise<User> {
    const { googleId, email, fullName } = profile;

    // 1. Déjà un compte Google connu → retour direct.
    const byGoogleId = await this.prisma.user.findUnique({
      where: { googleId },
    });
    if (byGoogleId) {
      if (!byGoogleId.isActive || byGoogleId.legacyStaffRetiredAt) {
        throw new BadRequestException('Compte utilisateur indisponible');
      }
      return byGoogleId;
    }

    // 2. Un compte existe déjà avec le même email.
    //    - provider "google" (rare, sans googleId) → on rattache l'id.
    //    - provider "email" (mot de passe) → on garde le compte existant et on
    //      le marque aussi accessible via Google (même personne, email vérifié
    //      par Google). Le mot de passe reste fonctionnel.
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      if (!existing.isActive || existing.legacyStaffRetiredAt) {
        throw new BadRequestException('Compte utilisateur indisponible');
      }
      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          googleId,
          provider: existing.provider === 'google' ? 'google' : 'email',
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        },
      });
      this.logger.log(
        `Google login linked to existing account ${email} (${user.id})`,
      );
      return user;
    }

    // 3. Nouvel utilisateur Google → création + onboarding complet
    //    (team + abonnement), exactement comme le parcours register→verifyEmail.
    const onboarding = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          fullName,
          provider: 'google',
          googleId,
          role: Role.MEMBER,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
      const team = await this.teamsService.create(
        {
          name: `${fullName.split(' ')[0]} — Personnel`,
          type: WorkspaceType.PERSONAL,
        },
        user.id,
        tx,
      );
      await tx.auditLog.create({
        data: {
          userId: user.id,
          teamId: team.id,
          action: 'AUTH_REGISTER',
          resourceType: 'User',
          resourceId: user.id,
          metadata: { email: user.email },
        },
      });
      return { user, workspaceId: team.id };
    });
    const created = onboarding.user;

    await this.auditService.record(
      created.id,
      'AUTH_GOOGLE_LOGIN',
      'User',
      created.id,
      { email: created.email },
      onboarding.workspaceId,
    );

    this.logger.log(`New Google user created: ${email} (${created.id})`);
    return created;
  }

  /**
   * Détache le compte Google d'un utilisateur (si sa connexion devient
   * "email uniquement"). Gardé pour une future route "gérer les connexions".
   */
  async unlinkGoogle(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('Utilisateur introuvable');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { googleId: null },
    });
    this.logger.log(`Google unlinked for user ${userId}`);
  }
}
