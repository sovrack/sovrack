import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvitationStatus,
  MembershipStatus,
  WorkspaceRole,
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
        invitedBy: { select: { id: true, fullName: true, email: true } },
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
    const role = dto.role ?? WorkspaceRole.MEMBER;
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
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: {
        teams: {
          where: { teamId: workspaceId, status: MembershipStatus.ACTIVE },
          select: { id: true },
        },
      },
    });
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
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      include: { team: { select: { name: true, slug: true } } },
    });

    const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') ?? '';
    const link = `${frontendUrl}/invitations/accept?token=${encodeURIComponent(token)}`;
    await this.smtp.sendBillingEmail(
      email,
      `Invitation au workspace ${invitation.team.name}`,
      `<p>Vous avez été invité à rejoindre <strong>${this.escapeHtml(invitation.team.name)}</strong>.</p><p><a href="${this.escapeHtml(link)}">Accepter l'invitation</a></p><p>Cette invitation expire dans 7 jours.</p>`,
    );

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
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
        include: { team: { select: { id: true, name: true, slug: true } } },
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

    await this.prisma.$transaction(async (tx) => {
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
    });

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
