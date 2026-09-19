import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MembershipStatus,
  Prisma,
  WorkspaceRole,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';

const SERIALIZABLE_RETRIES = 3;
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/**
 * Two-phase customer deletion.
 *
 * Confirmation immediately revokes access, then keeps the identity for a
 * recoverable 30-day grace period. Organization resources are preserved.
 * A personal workspace has no transferable owner, so it is marked for
 * deletion with the identity and purged only after the same grace period.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scheduleIdentityDeletion(
    userId: string,
  ): Promise<{ email: string; scheduledFor: Date }> {
    const requestedAt = new Date();
    const scheduledFor = new Date(
      requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 86_400_000,
    );

    return this.runSerializable(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          deletionScheduledFor: true,
          teams: {
            where: {
              role: WorkspaceRole.OWNER,
              status: MembershipStatus.ACTIVE,
            },
            select: {
              teamId: true,
              team: { select: { type: true } },
            },
          },
        },
      });
      if (!user) throw new NotFoundException('Utilisateur introuvable');
      if (user.deletionScheduledFor) {
        return { email: user.email, scheduledFor: user.deletionScheduledFor };
      }

      for (const membership of user.teams) {
        if (membership.team.type === WorkspaceType.PERSONAL) continue;
        const remainingOwners = await tx.teamMember.count({
          where: {
            teamId: membership.teamId,
            userId: { not: userId },
            role: WorkspaceRole.OWNER,
            status: MembershipStatus.ACTIVE,
            user: {
              isActive: true,
              deletionScheduledFor: null,
              legacyStaffRetiredAt: null,
            },
          },
        });
        if (remainingOwners === 0) {
          throw new BadRequestException({
            code: 'LAST_OWNER_REQUIRED',
            message:
              'Transférez la propriété de chaque organisation avant de programmer la suppression du compte.',
            details: { workspaceId: membership.teamId },
          });
        }
      }

      await tx.team.updateMany({
        where: {
          personalOwnerId: userId,
          type: WorkspaceType.PERSONAL,
          status: WorkspaceStatus.ACTIVE,
        },
        data: { status: WorkspaceStatus.DELETION_PENDING },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          sessionVersion: { increment: 1 },
          deleteAccountCode: null,
          deleteAccountExpiresAt: null,
          deletionRequestedAt: requestedAt,
          deletionScheduledFor: scheduledFor,
        },
      });

      return { email: user.email, scheduledFor };
    });
  }

  async cancelIdentityDeletion(
    userId: string,
  ): Promise<{ email: string; restored: true }> {
    return this.runSerializable(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true, deletionScheduledFor: true },
      });
      if (!user) throw new NotFoundException('Utilisateur introuvable');
      if (!user.deletionScheduledFor) {
        throw new BadRequestException({
          code: 'ACCOUNT_DELETION_NOT_SCHEDULED',
          message: "Aucune suppression n'est programmée pour ce compte",
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          isActive: true,
          sessionVersion: { increment: 1 },
          deletionRequestedAt: null,
          deletionScheduledFor: null,
        },
      });
      await tx.team.updateMany({
        where: {
          personalOwnerId: userId,
          type: WorkspaceType.PERSONAL,
          status: WorkspaceStatus.DELETION_PENDING,
        },
        data: { status: WorkspaceStatus.ACTIVE },
      });
      return { email: user.email, restored: true as const };
    });
  }

  /** Internal retention job. Never expose this method through HTTP. */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'purge-expired-customer-identities',
  })
  async purgeDueIdentities(): Promise<void> {
    const due = await this.prisma.user.findMany({
      where: { deletionScheduledFor: { lte: new Date() } },
      select: { id: true },
      take: 100,
      orderBy: { deletionScheduledFor: 'asc' },
    });
    for (const { id } of due) {
      try {
        await this.purgeIdentity(id);
      } catch (error) {
        this.logger.error(
          `Unable to purge scheduled identity ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async purgeIdentity(userId: string): Promise<void> {
    await this.runSerializable(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { deletionScheduledFor: true },
      });
      if (!user?.deletionScheduledFor) return;
      if (user.deletionScheduledFor.getTime() > Date.now()) return;

      await tx.team.deleteMany({
        where: {
          personalOwnerId: userId,
          type: WorkspaceType.PERSONAL,
          status: WorkspaceStatus.DELETION_PENDING,
        },
      });
      await tx.user.delete({ where: { id: userId } });
    });
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
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
    throw new Error('Transaction impossible après plusieurs essais');
  }
}
