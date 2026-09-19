import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipStatus,
  Prisma,
  WorkspaceRole,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { WorkspaceAccessService } from '../authorization/workspace-access.service';
import { WorkspaceActions } from '../authorization/workspace-policy.types';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UsageGuardService } from '../../billing/usage-guard.service';
import {
  buildWorkspaceSlug,
  runSerializable,
  WorkspaceWithMembers,
  workspaceWithMembersInclude,
} from './workspace-persistence';
import {
  assertCanAssignWorkspaceRole,
  assertCollaborativeWorkspace,
  assertNotLastWorkspaceOwner,
  getActiveMembershipOrFail,
} from './workspace-rules';

type WorkspaceCreationInput = CreateTeamDto & {
  type?: WorkspaceType;
};

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageGuard: UsageGuardService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async findAll(actor: { id: string }) {
    const workspaces = await this.prisma.team.findMany({
      where: {
        status: WorkspaceStatus.ACTIVE,
        members: {
          some: { userId: actor.id, status: MembershipStatus.ACTIVE },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        members: {
          where: { userId: actor.id, status: MembershipStatus.ACTIVE },
          select: { role: true, status: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return workspaces.map(({ members, ...workspace }) => ({
      ...workspace,
      role: members[0].role,
      membershipStatus: members[0].status,
    }));
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
    dto: WorkspaceCreationInput,
    creatorUserId: string,
    database: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<WorkspaceWithMembers> {
    const name = dto.name.trim();
    const type = dto.type ?? WorkspaceType.ORGANIZATION;
    if (type === WorkspaceType.PERSONAL) {
      const existing = await database.team.findFirst({
        where: { personalOwnerId: creatorUserId },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'Ce compte possède déjà un espace personnel',
        );
      }
    }
    const workspace = await database.team.create({
      data: {
        name,
        slug: buildWorkspaceSlug(name),
        description: dto.description?.trim() || null,
        type,
        status: WorkspaceStatus.ACTIVE,
        personalOwnerId: type === WorkspaceType.PERSONAL ? creatorUserId : null,
        ...(type === WorkspaceType.ORGANIZATION
          ? { organizationProfile: { create: {} } }
          : {}),
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
    const workspace = await this.prisma.team.update({
      where: { id },
      data: { status: WorkspaceStatus.ARCHIVED },
      include: workspaceWithMembersInclude,
    });
    this.logger.warn(`Workspace "${workspace.name}" (${id}) archived`);
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
    await assertCollaborativeWorkspace(this.prisma, id);
    await this.usageGuard.guardForTeam(id, 'ADD_TEAM_MEMBER');

    const targetRole = dto.role ?? WorkspaceRole.MEMBER;
    assertCanAssignWorkspaceRole(actorContext.workspaceRole, targetRole);
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
    await assertCollaborativeWorkspace(this.prisma, id);
    assertCanAssignWorkspaceRole(actorContext.workspaceRole, role);
    return runSerializable(this.prisma, async (tx) => {
      const membership = await getActiveMembershipOrFail(tx, id, targetUserId);

      if (
        membership.role === WorkspaceRole.OWNER &&
        role !== WorkspaceRole.OWNER
      ) {
        await assertNotLastWorkspaceOwner(tx, id, targetUserId);
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

  async updateMemberBillingAccess(
    id: string,
    targetUserId: string,
    canManageBilling: boolean,
    actor: { id: string },
  ): Promise<WorkspaceWithMembers> {
    const actorContext = await this.workspaceAccess.assertWorkspaceAction(
      id,
      actor.id,
      WorkspaceActions.MANAGE_OWNERS,
    );
    await assertCollaborativeWorkspace(this.prisma, id);
    if (actorContext.workspaceRole !== WorkspaceRole.OWNER) {
      throw new ForbiddenException(
        'Seul un OWNER peut déléguer la gestion de la facturation',
      );
    }
    await getActiveMembershipOrFail(this.prisma, id, targetUserId);
    await this.prisma.teamMember.update({
      where: { teamId_userId: { teamId: id, userId: targetUserId } },
      data: { canManageBilling },
    });
    return this.findOne(id, actor);
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
    await assertCollaborativeWorkspace(this.prisma, id);
    return runSerializable(this.prisma, async (tx) => {
      const membership = await getActiveMembershipOrFail(tx, id, userId);

      if (membership.role === WorkspaceRole.OWNER) {
        if (actorContext.workspaceRole !== WorkspaceRole.OWNER) {
          throw new ForbiddenException('Seul un OWNER peut retirer un OWNER');
        }
        await assertNotLastWorkspaceOwner(tx, id, userId);
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

  async leaveWorkspace(id: string, actor: { id: string }): Promise<void> {
    await this.workspaceAccess.assertWorkspaceAction(
      id,
      actor.id,
      WorkspaceActions.READ,
    );
    await assertCollaborativeWorkspace(this.prisma, id);

    await runSerializable(this.prisma, async (tx) => {
      const membership = await getActiveMembershipOrFail(tx, id, actor.id);
      if (membership.role === WorkspaceRole.OWNER) {
        await assertNotLastWorkspaceOwner(tx, id, actor.id);
      }
      await tx.teamMember.delete({
        where: { teamId_userId: { teamId: id, userId: actor.id } },
      });
    });
    this.logger.log(`User ${actor.id} left workspace ${id}`);
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
    await assertCollaborativeWorkspace(this.prisma, id);

    return runSerializable(this.prisma, async (tx) => {
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
          await assertNotLastWorkspaceOwner(tx, id, targetUserId);
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

  async convertPersonalToOrganization(
    id: string,
    name: string,
    actor: { id: string },
  ): Promise<WorkspaceWithMembers> {
    const context = await this.workspaceAccess.assertWorkspaceAction(
      id,
      actor.id,
      WorkspaceActions.UPDATE,
    );
    if (context.workspaceRole !== WorkspaceRole.OWNER) {
      throw new ForbiddenException(
        'Seul le propriétaire peut convertir cet espace',
      );
    }

    return runSerializable(this.prisma, async (tx) => {
      const workspace = await tx.team.findUnique({
        where: { id },
        select: { type: true, personalOwnerId: true },
      });
      if (!workspace) throw new NotFoundException('Workspace introuvable');
      if (workspace.type !== WorkspaceType.PERSONAL) {
        throw new ConflictException(
          'Seul un espace personnel peut être converti',
        );
      }
      if (workspace.personalOwnerId !== actor.id) {
        throw new ForbiddenException(
          'Seul le propriétaire personnel peut effectuer cette conversion',
        );
      }

      const converted = await tx.team.update({
        where: { id },
        data: {
          name: name.trim(),
          type: WorkspaceType.ORGANIZATION,
          personalOwnerId: null,
          organizationProfile: { create: {} },
        },
        include: workspaceWithMembersInclude,
      });
      return converted;
    });
  }
}
