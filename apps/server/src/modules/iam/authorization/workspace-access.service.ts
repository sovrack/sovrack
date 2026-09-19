import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipStatus,
  ProjectRole,
  WorkspaceRole,
  WorkspaceStatus,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  ProjectAction,
  ProjectActions,
  ProjectActorContext,
  WorkspaceAction,
  WorkspaceActions,
  WorkspaceActorContext,
} from './workspace-policy.types';

const WORKSPACE_PERMISSIONS: Readonly<
  Record<WorkspaceRole, ReadonlySet<WorkspaceAction>>
> = {
  OWNER: new Set(Object.values(WorkspaceActions)),
  ADMIN: new Set([
    WorkspaceActions.READ,
    WorkspaceActions.UPDATE,
    WorkspaceActions.INVITE_MEMBER,
    WorkspaceActions.MANAGE_MEMBERS,
    WorkspaceActions.CREATE_PROJECT,
    WorkspaceActions.DELETE_PROJECT,
    WorkspaceActions.READ_SERVER,
    WorkspaceActions.MANAGE_SERVER,
    WorkspaceActions.USE_TERMINAL,
    WorkspaceActions.READ_INTEGRATION,
    WorkspaceActions.MANAGE_INTEGRATION,
  ]),
  MEMBER: new Set([WorkspaceActions.READ]),
};

const PROJECT_PERMISSIONS: Readonly<
  Record<ProjectRole, ReadonlySet<ProjectAction>>
> = {
  MAINTAINER: new Set(Object.values(ProjectActions)),
  DEVELOPER: new Set([ProjectActions.READ, ProjectActions.DEPLOY]),
  VIEWER: new Set([ProjectActions.READ]),
};

@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWorkspaceId(
    userId: string,
    requestedWorkspaceId?: string | null,
  ): Promise<string> {
    if (requestedWorkspaceId?.trim()) {
      await this.assertWorkspaceAction(
        requestedWorkspaceId.trim(),
        userId,
        WorkspaceActions.READ,
      );
      return requestedWorkspaceId.trim();
    }

    const memberships = await this.prisma.teamMember.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: { teamId: true },
      take: 2,
      orderBy: { joinedAt: 'asc' },
    });

    if (memberships.length === 0) {
      throw new NotFoundException('Aucun workspace actif associé à ce compte');
    }
    if (memberships.length > 1) {
      throw new BadRequestException({
        code: 'WORKSPACE_CONTEXT_REQUIRED',
        message: 'Sélectionnez explicitement un workspace',
      });
    }
    return memberships[0].teamId;
  }

  async assertWorkspaceAction(
    workspaceId: string,
    userId: string,
    action: WorkspaceAction,
  ): Promise<WorkspaceActorContext> {
    const membership = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: workspaceId, userId } },
      select: {
        role: true,
        canManageBilling: true,
        status: true,
        user: { select: { isActive: true } },
        team: { select: { status: true } },
      },
    });

    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      !membership.user.isActive ||
      membership.team.status !== WorkspaceStatus.ACTIVE
    ) {
      throw new NotFoundException('Workspace introuvable');
    }
    const billingPermission =
      action === WorkspaceActions.READ_BILLING ||
      action === WorkspaceActions.MANAGE_BILLING;
    const isAllowed =
      WORKSPACE_PERMISSIONS[membership.role].has(action) ||
      (billingPermission && membership.canManageBilling);
    if (!isAllowed) {
      throw new ForbiddenException({
        code: 'WORKSPACE_ACCESS_DENIED',
        message: "Votre rôle ne permet pas d'effectuer cette action",
      });
    }

    return {
      userId,
      workspaceId,
      workspaceRole: membership.role,
      canManageBilling: membership.canManageBilling,
    };
  }

  async assertProjectAction(
    projectId: string,
    userId: string,
    action: ProjectAction,
    expectedWorkspaceId?: string,
  ): Promise<ProjectActorContext> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        teamId: true,
        members: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (
      !project ||
      (expectedWorkspaceId && project.teamId !== expectedWorkspaceId)
    ) {
      throw new NotFoundException('Projet introuvable');
    }

    const workspace = await this.assertWorkspaceAction(
      project.teamId,
      userId,
      WorkspaceActions.READ,
    );

    const directRole = project.members[0]?.role ?? null;
    const inheritsMaintainer =
      workspace.workspaceRole === WorkspaceRole.OWNER ||
      (workspace.workspaceRole === WorkspaceRole.ADMIN &&
        action !== ProjectActions.READ_SECRETS);
    const effectiveRole = inheritsMaintainer
      ? ProjectRole.MAINTAINER
      : directRole;

    if (!effectiveRole) {
      throw new NotFoundException('Projet introuvable');
    }
    if (!PROJECT_PERMISSIONS[effectiveRole].has(action)) {
      throw new ForbiddenException({
        code: 'PROJECT_ACCESS_DENIED',
        message: "Votre rôle projet ne permet pas d'effectuer cette action",
      });
    }

    return {
      ...workspace,
      projectId,
      projectRole: directRole,
      effectiveProjectRole: effectiveRole,
    };
  }

  async assertUserIsActiveMember(
    workspaceId: string,
    targetUserId: string,
  ): Promise<void> {
    const member = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId: workspaceId, userId: targetUserId },
      },
      select: { status: true },
    });
    if (!member || member.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Membre du workspace introuvable');
    }
  }

  async assertServerAction(
    serverId: string,
    userId: string,
    action: WorkspaceAction,
    expectedWorkspaceId?: string,
  ): Promise<WorkspaceActorContext> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { teamId: true, isActive: true, archivedAt: true },
    });
    if (
      !server ||
      !server.isActive ||
      server.archivedAt !== null ||
      (expectedWorkspaceId && server.teamId !== expectedWorkspaceId)
    ) {
      throw new NotFoundException('Serveur introuvable');
    }
    return this.assertWorkspaceAction(server.teamId, userId, action);
  }
}
