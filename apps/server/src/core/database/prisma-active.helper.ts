/**
 * Helpers for the uniform soft-delete convention (`archivedAt: null` = active).
 *
 * Models that opt into soft-delete (Service, Server) should filter their list
 * and single-row reads through {@link ACTIVE_FILTER} / {@link activeWhere} so
 * archived rows disappear from the API while their history is preserved.
 */
export const ACTIVE_FILTER = { archivedAt: null } as const;

/**
 * Merge the active-only filter into an existing Prisma `where`. The caller's
 * own conditions win except for `archivedAt`, which is forced to null.
 */
export function activeWhere<T extends object>(
  where?: T,
): T & { archivedAt: null } {
  return { ...(where ?? ({} as T)), archivedAt: null };
}
