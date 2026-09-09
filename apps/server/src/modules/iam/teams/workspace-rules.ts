import {
  ConflictException,
  ForbiddenException,
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

type Database = Prisma.TransactionClient | PrismaService;

export async function getActiveMembershipOrFail(
  database: Database,
  teamId: string,
  userId: string,
) {
  const membership = await database.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    throw new NotFoundException('Membre du workspace introuvable');
  }
  return membership;
}

export async function assertCollaborativeWorkspace(
  database: Database,
  id: string,
): Promise<void> {
  const workspace = await database.team.findUnique({
    where: { id },
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

export function assertCanAssignWorkspaceRole(
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

export async function assertNotLastWorkspaceOwner(
  database: Database,
  teamId: string,
  targetUserId: string,
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
