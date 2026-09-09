import { MembershipStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../shared/database/prisma.service';

export const workspaceWithMembersInclude = {
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

export type WorkspaceWithMembers = Prisma.TeamGetPayload<{
  include: typeof workspaceWithMembersInclude;
}>;

export async function runSerializable<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
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

export function buildWorkspaceSlug(name: string): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workspace';
  return `${base}-${randomBytes(4).toString('hex')}`;
}
