import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { CryptoService } from '../../../core/crypto/crypto.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
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
    await this.assertCanManage(projectId, environmentId, userId, userRole);

    const stored = isSecret ? this.encrypt(value) : value;

    const config = await this.prisma.environmentConfig.upsert({
      where: { projectId_environmentId_key: { projectId, environmentId, key } },
      create: { projectId, environmentId, key, value: stored, isSecret },
      update: { value: stored, isSecret },
    });

    return this.toPublic(config);
  }

  async findAll(
    projectId: string,
    environmentId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvConfigPublic[]> {
    await this.assertCanAccess(projectId, environmentId, userId, userRole);

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
    await this.assertCanManage(projectId, environmentId, userId, userRole);

    await this.prisma.environmentConfig.deleteMany({
      where: { projectId, environmentId, key },
    });
  }

  /**
   * Merge global configs + env-specific overrides.
   * Env-specific always wins over global.
   */
  async getMergedDecrypted(
    projectId: string,
    environmentId: string,
    userId: string,
    userRole: Role,
  ): Promise<Record<string, string>> {
    await this.assertCanAccess(projectId, environmentId, userId, userRole);

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

    return result;
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

  private async assertCanAccess(
    projectId: string,
    environmentId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.assertEnvironmentBelongsToProject(projectId, environmentId);
    if (userRole === Role.ADMIN) return;
    const m = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!m) throw new ForbiddenException('Accès non autorisé à ce projet');
  }

  private async assertCanManage(
    projectId: string,
    environmentId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.assertEnvironmentBelongsToProject(projectId, environmentId);
    if (userRole === Role.ADMIN) return;
    const m = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });
    if (m?.role === ProjectRole.OWNER) return;
    throw new ForbiddenException('Action réservée au OWNER ou ADMIN');
  }

  private async assertEnvironmentBelongsToProject(
    projectId: string,
    environmentId: string,
  ): Promise<void> {
    const env = await this.prisma.environment.findFirst({
      where: { id: environmentId, projectId },
      select: { id: true },
    });
    if (!env) throw new NotFoundException('Environnement introuvable pour ce projet');
  }
}
