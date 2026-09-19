import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  InvitationDeliveryStatus,
  InvitationStatus,
  MembershipStatus,
  WorkspaceRole,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../shared/database/prisma.service';
import { NotificationsSmtpService } from '../../notifications/notifications-smtp.service';
import { UsageGuardService } from '../../billing/usage-guard.service';
import { WorkspaceAccessService } from '../authorization/workspace-access.service';
import { WorkspaceActions } from '../authorization/workspace-policy.types';
import { InviteWorkspaceMemberDto } from './dto/invite-workspace-member.dto';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class WorkspaceInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly usageGuard: UsageGuardService,
    private readonly smtp: NotificationsSmtpService,
  ) {}

  async list(workspaceId: string, actorUserId: string) {
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      actorUserId,
      WorkspaceActions.MANAGE_MEMBERS,
    );
    await this.assertOrganization(workspaceId);
    await this.expireStale(workspaceId);
    return this.prisma.workspaceInvitation.findMany({
      where: { teamId: workspaceId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        deliveryStatus: true,
        deliveryAttempts: true,
        deliveredAt: true,
        lastDeliveryAttemptAt: true,
        invitedByEmail: true,
        invitedByName: true,
        invitedBy: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async invite(
    workspaceId: string,
    actorUserId: string,
    dto: InviteWorkspaceMemberDto,
  ) {
    const actor = await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      actorUserId,
      WorkspaceActions.INVITE_MEMBER,
    );
    await this.assertOrganization(workspaceId);
    const role = dto.role ?? WorkspaceRole.MEMBER;
    if (role === WorkspaceRole.OWNER) {
      throw new BadRequestException({
        code: 'WORKSPACE_INVITATION_ROLE_INVALID',
        message:
          'Invitez comme MEMBER ou ADMIN. La propriété et la facturation se délèguent séparément après acceptation.',
      });
    }
    if (
      actor.workspaceRole !== WorkspaceRole.OWNER &&
      role !== WorkspaceRole.MEMBER
    ) {
      throw new ForbiddenException(
        'Un ADMIN peut uniquement inviter avec le rôle MEMBER',
      );
    }
    await this.usageGuard.guardForTeam(workspaceId, 'ADD_TEAM_MEMBER');

    const email = dto.email.trim().toLowerCase();
    const [existingUser, inviter] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email },
        select: {
          teams: {
            where: { teamId: workspaceId, status: MembershipStatus.ACTIVE },
            select: { id: true },
          },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { email: true, fullName: true },
      }),
    ]);
    if (!inviter) throw new NotFoundException('Inviteur introuvable');
    if (existingUser?.teams.length) {
      throw new ConflictException(
        'Cette personne est déjà membre du workspace',
      );
    }

    await this.prisma.workspaceInvitation.updateMany({
      where: {
        teamId: workspaceId,
        email,
        status: InvitationStatus.PENDING,
      },
      data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
    });

    const token = randomBytes(32).toString('base64url');
    const invitation = await this.prisma.workspaceInvitation.create({
      data: {
        teamId: workspaceId,
        email,
        role,
        tokenHash: this.hashToken(token),
        invitedById: actorUserId,
        invitedByEmail: inviter.email,
        invitedByName: inviter.fullName,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      include: { team: { select: { name: true, slug: true } } },
    });

    const frontendUrl = (
      process.env.CUSTOMER_APP_URL ??
      process.env.FRONTEND_URL ??
      ''
    ).replace(/\/$/, '');
    const link = `${frontendUrl}/invitations/accept?token=${encodeURIComponent(token)}`;
    const attemptedAt = new Date();
    try {
      await this.smtp.sendTransactionalEmail(
        email,
        `Invitation au workspace ${invitation.team.name}`,
        `<p>Vous avez été invité à rejoindre <strong>${this.escapeHtml(invitation.team.name)}</strong>.</p><p><a href="${this.escapeHtml(link)}">Accepter l'invitation</a></p><p>Cette invitation expire dans 7 jours.</p>`,
      );
      await this.prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          deliveryStatus: InvitationDeliveryStatus.SENT,
          deliveryAttempts: { increment: 1 },
          deliveredAt: attemptedAt,
          lastDeliveryAttemptAt: attemptedAt,
          lastDeliveryError: null,
        },
      });
    } catch (error) {
      await this.prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          deliveryStatus: InvitationDeliveryStatus.FAILED,
          deliveryAttempts: { increment: 1 },
          lastDeliveryAttemptAt: attemptedAt,
          lastDeliveryError:
            error instanceof Error ? error.name.slice(0, 100) : 'UnknownError',
        },
      });
      throw new ServiceUnavailableException({
        code: 'INVITATION_DELIVERY_FAILED',
        message:
          "L'invitation a été enregistrée mais l'email n'a pas été remis. Vous pouvez la renvoyer.",
      });
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      deliveryStatus: InvitationDeliveryStatus.SENT,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  async resend(workspaceId: string, invitationId: string, actorUserId: string) {
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      actorUserId,
      WorkspaceActions.INVITE_MEMBER,
    );
    await this.assertOrganization(workspaceId);
    const invitation = await this.prisma.workspaceInvitation.findFirst({
      where: {
        id: invitationId,
        teamId: workspaceId,
        status: InvitationStatus.PENDING,
      },
      select: { email: true, role: true },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation active introuvable');
    }
    if (
      invitation.role !== WorkspaceRole.ADMIN &&
      invitation.role !== WorkspaceRole.MEMBER
    ) {
      throw new BadRequestException('Rôle historique non réutilisable');
    }
    return this.invite(workspaceId, actorUserId, {
      email: invitation.email,
      role: invitation.role,
    });
  }

  async revoke(
    workspaceId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      actorUserId,
      WorkspaceActions.MANAGE_MEMBERS,
    );
    await this.assertOrganization(workspaceId);
    const invitation = await this.prisma.workspaceInvitation.findFirst({
      where: { id: invitationId, teamId: workspaceId },
      select: { id: true, status: true },
    });
    if (!invitation) throw new NotFoundException('Invitation introuvable');
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException("Cette invitation n'est plus active");
    }
    await this.prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
    });
  }

  async accept(token: string, actorUserId: string) {
    const tokenHash = this.hashToken(token);
    const [user, invitation] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { id: true, email: true, isActive: true },
      }),
      this.prisma.workspaceInvitation.findUnique({
        where: { tokenHash },
        include: {
          team: { select: { id: true, name: true, slug: true, type: true } },
        },
      }),
    ]);
    if (!user?.isActive)
      throw new NotFoundException('Compte utilisateur introuvable');
    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Invitation invalide ou déjà utilisée');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      await this.prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new BadRequestException('Cette invitation a expiré');
    }
    if (invitation.email !== user.email.toLowerCase()) {
      throw new ForbiddenException(
        'Cette invitation est destinée à une autre adresse email',
      );
    }
    if (invitation.team.type !== WorkspaceType.ORGANIZATION) {
      throw new ConflictException(
        "Les invitations sont réservées aux espaces d'organisation",
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        await this.usageGuard.guardForTeam(
          invitation.teamId,
          'ADD_TEAM_MEMBER',
          tx,
        );
        await tx.teamMember.upsert({
          where: {
            teamId_userId: { teamId: invitation.teamId, userId: user.id },
          },
          create: {
            teamId: invitation.teamId,
            userId: user.id,
            role: invitation.role,
            status: MembershipStatus.ACTIVE,
          },
          update: {
            role: invitation.role,
            status: MembershipStatus.ACTIVE,
          },
        });
        const updated = await tx.workspaceInvitation.updateMany({
          where: { id: invitation.id, status: InvitationStatus.PENDING },
          data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
        });
        if (updated.count !== 1) {
          throw new ConflictException('Invitation déjà utilisée');
        }
      },
      { isolationLevel: 'Serializable' },
    );

    return invitation.team;
  }

  private async expireStale(workspaceId: string): Promise<void> {
    await this.prisma.workspaceInvitation.updateMany({
      where: {
        teamId: workspaceId,
        status: InvitationStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'expire-workspace-invitations',
  })
  async expireAllStale(): Promise<void> {
    await this.prisma.workspaceInvitation.updateMany({
      where: {
        status: InvitationStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });
  }

  private async assertOrganization(workspaceId: string): Promise<void> {
    const workspace = await this.prisma.team.findUnique({
      where: { id: workspaceId },
      select: { type: true, status: true },
    });
    if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new NotFoundException('Workspace introuvable');
    }
    if (workspace.type !== WorkspaceType.ORGANIZATION) {
      throw new ConflictException({
        code: 'PERSONAL_WORKSPACE_SINGLE_USER',
        message:
          "Convertissez d'abord cet espace personnel en organisation pour inviter des membres",
      });
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
