import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { Prisma } from '@prisma/client';

export type StaffAuditAction =
  | 'staff.login'
  | 'staff.logout'
  | 'staff.create'
  | 'staff.invite'
  | 'staff.invitation.resend'
  | 'staff.invitation.accept'
  | 'staff.password.reset.requested'
  | 'staff.password.reset.delivery_failed'
  | 'staff.password.reset.completed'
  | 'staff.password.recovery.executed'
  | 'staff.update'
  | 'staff.block'
  | 'platform.email.settings.update'
  | 'platform.email.settings.test'
  | 'user.block'
  | 'user.unblock'
  | 'user.role.change'
  | 'user.delete'
  | 'user.impersonate';

/**
 * Journal d'audit du back-office — APPEND-ONLY.
 * Le service n'expose QUE des inserts : aucune mise à jour / suppression
 * possible depuis le code applicatif (les comptes avec accès DB restent le
 * dernier rempart, mais le modèle ne fournit aucun chemin d'écriture).
 */
@Injectable()
export class StaffAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    staffId?: string | null;
    action: StaffAuditAction;
    resource: string;
    resourceId?: string | null;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  }): Promise<void> {
    await this.prisma.staffAuditLog.create({
      data: {
        staffId: input.staffId ?? null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        beforeJson:
          input.before === undefined || input.before === null
            ? Prisma.DbNull
            : (input.before as Prisma.InputJsonValue),
        afterJson:
          input.after === undefined || input.after === null
            ? Prisma.DbNull
            : (input.after as Prisma.InputJsonValue),
        ip: input.ip ?? null,
      },
    });
  }

  /**
   * Lecture du journal (append-only = aucune écriture en dehors de record).
   * Réservé aux ROOT/ADMIN côté back-office.
   */
  async list(input: { page?: number; limit?: number }): Promise<{
    total: number;
    page: number;
    limit: number;
    items: unknown[];
  }> {
    const rawPage = input.page ?? 1;
    const rawLimit = input.limit ?? 50;
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const limit = Number.isFinite(rawLimit)
      ? Math.min(100, Math.max(1, rawLimit))
      : 50;
    const [total, rows] = await Promise.all([
      this.prisma.staffAuditLog.count(),
      this.prisma.staffAuditLog.findMany({
        orderBy: { id: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          staff: { select: { id: true, email: true, fullName: true } },
        },
      }),
    ]);
    return { total, page, limit, items: rows };
  }
}
