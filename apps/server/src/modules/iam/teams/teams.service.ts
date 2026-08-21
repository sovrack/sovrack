import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, Prisma, WorkspaceRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../shared/database/prisma.service';
import { WorkspaceAccessService } from '../authorization/workspace-access.service';
import { WorkspaceActions } from '../authorization/workspace-policy.types';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UsageGuardService } from '../../billing/usage-guard.service';

const workspaceWithMembersInclude = {
  members: {
    where: {
      status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] },
    },
    orderBy: { joinedAt: 'asc' as const },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.TeamInclude;

type WorkspaceWithMembers = Prisma.TeamGetPayload<{
  include: typeof workspaceWithMembersInclude;
}>;

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageGuard: UsageGuardService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async findAll(actor: { id: string }): Promise<WorkspaceWithMembers[]> {
    return this.prisma.team.findMany({
      where: {
        members: {
          some: { userId: actor.id, status: MembershipStatus.ACTIVE },
        },
      },
      include: workspaceWithMembersInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    id: string,
    actor: { id: string },
  ): Promise<WorkspaceWithMembers> {
    await this.workspaceAccess.assertWorkspaceAction(
      id,
      actor.id,
      WorkspaceActions.READ,
    );
    const workspace = await this.prisma.team.findUnique({
      where: { id },
      include: workspaceWithMembersInclude,
    });
    if (!workspace) throw new NotFoundException('Workspace introuvable');
    return workspace;
  }

  async create(
    dto: CreateTeamDto,
    creatorUserId: string,
    database: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<WorkspaceWithMembers> {
    const name = dto.name.trim();
    const workspace = await database.team.create({
      data: {
        name,
        slug: this.buildSlug(name),
        description: dto.description?.trim() || null,
        members: {
          create: {
            userId: creatorUserId,
            role: WorkspaceRole.OWNER,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      include: workspaceWithMembersInclude,
    });
    this.logger.log(`Workspace "${workspace.name}" (${workspace.id}) created`);
    return workspace;
  }

  async update(
    id: string,
    dto: UpdateTeamDto,
    actor: { id: string },
  ): Promise<WorkspaceWithMembers> {
    await this.workspaceAccess.assertWorkspaceAction(
      id,
      actor.id,
      WorkspaceActions.UPDATE,
    );
    return this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(typeof dto.description === 'string'
          ? { description: dto.description.trim() || null }
          : {}),
      },
      include: workspaceWithMembersInclude,
    });
  }

  async remove(
    id: string,
    actor: { id: string },
  ): Promise<WorkspaceWithMembers> {
    await this.workspaceAccess.assertWorkspaceAction(
      id,
      actor.id,
      WorkspaceActions.DELETE,
    );
    const workspace = await this.prisma.team.delete({
      where: { id },
      include: workspaceWithMembersInclude,
    });
    this.logger.warn(`Workspace "${workspace.name}" (${id}) deleted`);
    return workspace;
  }

  /** Transitional existing-user assignment; public onboarding uses invitations. */
  async addMember(
    id: string,
    dto: AddTeamMemberDto,
    actor: { id: string },
  ): Promise<WorkspaceWithMembers> {
    const actorContext = await this.workspaceAccess.assertWorkspaceAction(
      id,
      actor.id,
      WorkspaceActions.MANAGE_MEMBERS,
    );
    await this.usageGuard.guardForTeam(id, 'ADD_TEAM_MEMBER');

    const targetRole = dto.role ?? WorkspaceRole.MEMBER;
    this.assertCanAssignRole(actorContext.workspaceRole, targetRole);
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) throw new NotFoundException('Utilisateur introuvable');

    const existing = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: id, userId: dto.userId } },
    });
    if (existing?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException('Utilisateur déjà membre de ce workspace');
    }

    await this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: id, userId: dto.userId } },
      create: {
        teamId: id,
        userId: dto.userId,
        role: targetRole,
        status: MembershipStatus.ACTIVE,
      },
      update: { role: targetRole, status: MembershipStatus.ACTIVE },
    });
    return this.findOne(id, actor);
  }

  async updateMemberRole(
    id: string,
    targetUserId: string,
    role: WorkspaceRole,
    actor: { id: string },
  ): Promise<WorkspaceWithMembers> {
    const actorContext = await this.workspaceAccess.assertWorkspaceAction(
      id,
      actor.id,
      WorkspaceActions.MANAGE_MEMBERS,
    );
    this.assertCanAssignRole(actorContext.workspaceRole, role);
    return this.runSerializable(async (tx) => {
      const membership = await this.getMembershipOrFail(id, targetUserId, tx);

      if (
        membership.role === WorkspaceRole.OWNER &&
        role !== WorkspaceRole.OWNER
      ) {
        await this.assertNotLastOwner(id, targetUserId, tx);
      }
      if (
        membership.role === WorkspaceRole.OWNER &&
        actorContext.workspaceRole !== WorkspaceRole.OWNER
      ) {
        throw new ForbiddenException('Seul un OWNER peut gérer un autre OWNER');
      }

      await tx.teamMember.update({
        where: { teamId_userId: { teamId: id, userId: targetUserId } },
        data: { role },
      });
      const workspace = await tx.team.findUnique({
        where: { id },
        include: workspaceWithMembersInclude,
      });
      if (!workspace) throw new NotFoundException('Workspace introuvable');
      return workspace;
    });
  }

  async removeMember(
    id: string,
    userId: string,
    actor: { id: string },
  ): Promise<WorkspaceWithMembers> {
    const actorContext = await this.workspaceAccess.assertWorkspaceAction(
      id,
      actor.id,
      WorkspaceActions.MANAGE_MEMBERS,
    );
    return this.runSerializable(async (tx) => {
      const membership = await this.getMembershipOrFail(id, userId, tx);

      if (membership.role === WorkspaceRole.OWNER) {
        if (actorContext.workspaceRole !== WorkspaceRole.OWNER) {
          throw new ForbiddenException('Seul un OWNER peut retirer un OWNER');
        }
        await this.assertNotLastOwner(id, userId, tx);
      } else if (
        membership.role === WorkspaceRole.ADMIN &&
        actorContext.workspaceRole !== WorkspaceRole.OWNER
      ) {
        throw new ForbiddenException('Seul un OWNER peut retirer un ADMIN');
      }

      await tx.teamMember.delete({
        where: { teamId_userId: { teamId: id, userId } },
      });
      const workspace = await tx.team.findUnique({
        where: { id },
        include: workspaceWithMembersInclude,
      });
      if (!workspace) throw new NotFoundException('Workspace introuvable');
      return workspace;
    });
  }

  async updateMemberStatus(
    id: string,
    targetUserId: string,
    status: MembershipStatus,
    actor: { id: string },
  ): Promise<WorkspaceWithMembers> {
    if (
      status !== MembershipStatus.ACTIVE &&
      status !== MembershipStatus.SUSPENDED
    ) {
      throw new ConflictException('Statut de membre non modifiable');
    }
    const actorContext = await this.workspaceAccess.assertWorkspaceAction(
      id,
      actor.id,
      WorkspaceActions.MANAGE_MEMBERS,
    );

    return this.runSerializable(async (tx) => {
      const membership = await tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: id, userId: targetUserId } },
        include: { user: { select: { isActive: true } } },
      });
      if (!membership) {
        throw new NotFoundException('Membre du workspace introuvable');
      }
      if (status === MembershipStatus.ACTIVE && !membership.user.isActive) {
        throw new ConflictException('Le compte utilisateur est désactivé');
      }
      if (membership.role === WorkspaceRole.OWNER) {
        if (actorContext.workspaceRole !== WorkspaceRole.OWNER) {
          throw new ForbiddenException(
            'Seul un OWNER peut gérer un autre OWNER',
          );
        }
        if (
          membership.status === MembershipStatus.ACTIVE &&
          status === MembershipStatus.SUSPENDED
        ) {
          await this.assertNotLastOwner(id, targetUserId, tx);
        }
      } else if (
        membership.role === WorkspaceRole.ADMIN &&
        actorContext.workspaceRole !== WorkspaceRole.OWNER
      ) {
        throw new ForbiddenException('Seul un OWNER peut suspendre un ADMIN');
      }

      await tx.teamMember.update({
        where: { teamId_userId: { teamId: id, userId: targetUserId } },
        data: { status },
      });
      const workspace = await tx.team.findUnique({
        where: { id },
        include: workspaceWithMembersInclude,
      });
      if (!workspace) throw new NotFoundException('Workspace introuvable');
      return workspace;
    });
  }

  private async getMembershipOrFail(
    teamId: string,
    userId: string,
    database: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const membership = await database.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Membre du workspace introuvable');
    }
    return membership;
  }

  private assertCanAssignRole(
    actorRole: WorkspaceRole,
    targetRole: WorkspaceRole,
  ): void {
    if (
      actorRole !== WorkspaceRole.OWNER &&
      targetRole !== WorkspaceRole.MEMBER
    ) {
      throw new ForbiddenException(
        'Un ADMIN peut uniquement attribuer le rôle MEMBER',
      );
    }
  }

  private async assertNotLastOwner(
    teamId: string,
    targetUserId: string,
    database: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const ownerCount = await database.teamMember.count({
      where: {
        teamId,
        role: WorkspaceRole.OWNER,
        status: MembershipStatus.ACTIVE,
        userId: { not: targetUserId },
      },
    });
    if (ownerCount === 0) {
      throw new ConflictException({
        code: 'LAST_OWNER_REQUIRED',
        message: 'Le workspace doit conserver au moins un OWNER actif',
      });
    }
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 3
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('Opération workspace impossible après plusieurs essais');
  }

  private buildSlug(name: string): string {
    const base =
      name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'workspace';
    return `${base}-${randomBytes(4).toString('hex')}`;
  }
}
