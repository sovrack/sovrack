import type { Prisma } from '@prisma/client';

/**
 * Casts a typed value to Prisma.InputJsonValue without double-casting noise.
 *
 * Prisma stores arbitrary JSON as `JsonValue` which TypeScript cannot narrow
 * automatically from a typed object. Every callsite that needs to persist a
 * typed object in a Json column must cast it — this helper centralises that
 * cast so we avoid the verbose `as unknown as Prisma.InputJsonValue` scatter.
 *
 * Usage:
 *   specSnapshot: toJson(buildAppSpecSnapshot(...))
 *   conditions:   toJson(conditions)
 */
export function toJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
