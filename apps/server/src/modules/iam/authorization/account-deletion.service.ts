import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, Prisma, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';

const SERIALIZABLE_RETRIES = 3;

/**
 * Deletes a customer identity without ever deleting tenant-owned resources.
 * The last-owner check and deletion run in one SERIALIZABLE transaction so two
 * owners cannot concurrently leave the same workspace and orphan it.
 */
@Injectable()
export class AccountDeletionService {
  constructor(private readonly prisma: PrismaService) {}

  async deleteIdentity(userId: string): Promise<{ email: string }> {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const user = await tx.user.findUnique({
              where: { id: userId },
              select: { id: true, email: true },
            });
            if (!user) {
              throw new NotFoundException('Utilisateur introuvable');
            }

            const ownedMemberships = await tx.teamMember.findMany({
              where: {
                userId,
                role: WorkspaceRole.OWNER,
                status: MembershipStatus.ACTIVE,
              },
              select: { teamId: true },
            });

            for (const membership of ownedMemberships) {
              const activeOwners = await tx.teamMember.count({
                where: {
                  teamId: membership.teamId,
                  role: WorkspaceRole.OWNER,
                  status: MembershipStatus.ACTIVE,
                },
              });
              if (activeOwners <= 1) {
                throw new BadRequestException({
                  code: 'LAST_OWNER_REQUIRED',
                  message:
                    'Transférez la propriété ou supprimez explicitement le workspace avant de supprimer ce compte.',
                  details: { workspaceId: membership.teamId },
                });
              }
            }

            const memberships = await tx.teamMember.findMany({
              where: { userId },
              select: { teamId: true },
            });
            if (memberships.length > 0) {
              await tx.auditLog.createMany({
                data: memberships.map(({ teamId }) => ({
                  userId,
                  teamId,
                  action: 'ACCOUNT_LEFT_WORKSPACE',
                  resourceType: 'User',
                  resourceId: userId,
                  metadata: { email: user.email },
                })),
              });
            }

            // Prisma relations remove identity-owned memberships/keys while
            // workspace resources and audit records remain intact.
            await tx.user.delete({ where: { id: userId } });
            return { email: user.email };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < SERIALIZABLE_RETRIES
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Suppression du compte impossible après plusieurs essais');
  }
}
