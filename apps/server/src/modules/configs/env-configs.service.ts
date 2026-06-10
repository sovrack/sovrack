import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CryptoService } from '../../core/crypto/crypto.service';
import { ConfigsPermissionsService } from './configs-permissions.service';

export type EnvConfigPublic = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  environmentId: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class EnvConfigsService {
  // Short-lived in-memory cache to avoid double decryption in the
  // create-deployment → deploy-with-ansible flow. Keys are cache keys,
  // values are { value, expiresAt }.
  // TTL is intentionally short (a few seconds) because configs can change
  // and we want cache invalidation to be fast.
  private readonly cache = new Map<
    string,
    { value: Record<string, string>; expiresAt: number }
  >();
  private readonly CACHE_TTL_MS = 5_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly permissions: ConfigsPermissionsService,
  ) {}

  async upsert(
    projectId: string,
    environmentId: string,
    key: string,
    value: string,
    isSecret: boolean,
    userId: string,
    userRole: Role,
  ): Promise<EnvConfigPublic> {
    await this.permissions.assertEnvironmentBelongsToProject(projectId, environmentId);
    await this.permissions.assertCanManage(projectId, userId, userRole);

    const stored = isSecret ? this.encrypt(value) : value;

    const config = await this.prisma.environmentConfig.upsert({
      where: { projectId_environmentId_key: { projectId, environmentId, key } },
      create: { projectId, environmentId, key, value: stored, isSecret },
      update: { value: stored, isSecret },
    });

    this.invalidateCache(projectId, environmentId);
    return this.toPublic(config);
  }

  async findAll(
    projectId: string,
    environmentId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvConfigPublic[]> {
    await this.permissions.assertEnvironmentBelongsToProject(projectId, environmentId);
    await this.permissions.assertCanAccess(projectId, userId, userRole);

    const configs = await this.prisma.environmentConfig.findMany({
      where: { projectId, environmentId },
      orderBy: { createdAt: 'asc' },
    });

    return configs.map((c) => this.toPublic(c));
  }

  async remove(
    projectId: string,
    environmentId: string,
    key: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.permissions.assertEnvironmentBelongsToProject(projectId, environmentId);
    await this.permissions.assertCanManage(projectId, userId, userRole);

    await this.prisma.environmentConfig.deleteMany({
      where: { projectId, environmentId, key },
    });
    this.invalidateCache(projectId, environmentId);
  }

  /**
   * Merge global configs + env-specific overrides.
   * Env-specific always wins over global.
   * Uses a short-TTL cache to avoid double decryption when called twice
   * in the same deployment flow (e.g. create → ansible).
   */
  async getMergedDecrypted(
    projectId: string,
    environmentId: string,
    userId: string,
    userRole: Role,
  ): Promise<Record<string, string>> {
    const cacheKey = `${projectId}:${environmentId}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    await this.permissions.assertEnvironmentBelongsToProject(projectId, environmentId);
    await this.permissions.assertCanAccess(projectId, userId, userRole);

    const [globalConfigs, envConfigs] = await Promise.all([
      this.prisma.config.findMany({ where: { projectId } }),
      this.prisma.environmentConfig.findMany({ where: { projectId, environmentId } }),
    ]);

    const result: Record<string, string> = {};

    for (const c of globalConfigs) {
      result[c.key] = c.isSecret ? this.decrypt(c.value) : c.value;
    }

    for (const c of envConfigs) {
      result[c.key] = c.isSecret ? this.decrypt(c.value) : c.value;
    }

    // Store in cache with short TTL
    this.cache.set(cacheKey, {
      value: result,
      expiresAt: now + this.CACHE_TTL_MS,
    });

    return result;
  }

  /**
   * Invalidate the cache for a given project/environment.
   * Should be called when configs are upserted/removed to keep
   * the next read fresh.
   */
  invalidateCache(projectId: string, environmentId?: string): void {
    if (environmentId) {
      this.cache.delete(`${projectId}:${environmentId}`);
    } else {
      // Invalidate all entries for this project
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${projectId}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  private toPublic(config: {
    id: string;
    key: string;
    value: string;
    isSecret: boolean;
    environmentId: string;
    projectId: string;
    createdAt: Date;
    updatedAt: Date;
  }): EnvConfigPublic {
    return { ...config, value: config.isSecret ? '***' : config.value };
  }

  private encrypt(value: string): string {
    return this.crypto.encrypt(value);
  }

  private decrypt(value: string): string {
    return this.crypto.decrypt(value);
  }

}
