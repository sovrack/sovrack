import { GitProviderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';

/**
 * Shared write helper for the provider CRUD services (GitLab/GitHub/Gitea).
 * Runs `write` in a transaction; when `clearDefault` is set, it first clears the
 * existing default of that provider type so the single-default invariant holds.
 * Extracted from GitProviderConfigService so each per-provider service can reuse
 * it without depending on the others (R2 god-file split).
 */
export function writeWithSingleDefault<T>(
  prisma: PrismaService,
  type: GitProviderType,
  clearDefault: boolean,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    if (clearDefault) {
      await tx.gitProviderConfig.updateMany({
        where: { type, isDefault: true },
        data: { isDefault: false },
      });
    }
    return write(tx);
  });
}
