import { Injectable, NotFoundException } from '@nestjs/common';
import { Config, Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CryptoService } from '../../core/crypto/crypto.service';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { EnvConfigsService } from './env-configs.service';
import { ConfigsPermissionsService } from './configs-permissions.service';

type ConfigPublic = Omit<Config, 'value'> & { value: string };

@Injectable()
export class ConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly envConfigsService: EnvConfigsService,
    private readonly permissions: ConfigsPermissionsService,
  ) {}

  async create(
    projectId: string,
    dto: CreateConfigDto,
    userId: string,
    userRole: Role,
  ): Promise<ConfigPublic> {
    await this.permissions.assertCanManage(projectId, userId, userRole);

    const isSecret = dto.isSecret ?? false;

    const config = await this.prisma.config.create({
      data: {
        projectId,
        key: dto.key,
        isSecret,
        value: isSecret ? this.encrypt(dto.value) : dto.value,
      },
    });

    // Invalidate env config cache for all environments of this project
    this.envConfigsService.invalidateCache(projectId);
    return this.toPublic(config);
  }

  async findAll(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<ConfigPublic[]> {
    await this.permissions.assertCanAccess(projectId, userId, userRole);

    const configs = await this.prisma.config.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    return configs.map((item) => this.toPublic(item));
  }

  async findOne(
    projectId: string,
    configId: string,
    userId: string,
    userRole: Role,
  ): Promise<ConfigPublic> {
    await this.permissions.assertCanAccess(projectId, userId, userRole);

    const config = await this.prisma.config.findFirst({
      where: {
        id: configId,
        projectId,
      },
    });

    if (!config) {
      throw new NotFoundException('Configuration non trouvée');
    }

    return this.toPublic(config);
  }

  async update(
    projectId: string,
    configId: string,
    dto: UpdateConfigDto,
    userId: string,
    userRole: Role,
  ): Promise<ConfigPublic> {
    await this.permissions.assertCanManage(projectId, userId, userRole);

    const existing = await this.prisma.config.findFirst({
      where: {
        id: configId,
        projectId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Configuration non trouvée');
    }

    const nextIsSecret = dto.isSecret ?? existing.isSecret;
    const nextValue =
      dto.value === undefined
        ? existing.value
        : nextIsSecret
          ? this.encrypt(dto.value)
          : dto.value;

    const updated = await this.prisma.config.update({
      where: { id: configId },
      data: {
        key: dto.key,
        isSecret: nextIsSecret,
        value: nextValue,
      },
    });

    // Invalidate env config cache for all environments of this project
    this.envConfigsService.invalidateCache(projectId);
    return this.toPublic(updated);
  }

  async remove(
    projectId: string,
    configId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.permissions.assertCanManage(projectId, userId, userRole);

    const existing = await this.prisma.config.findFirst({
      where: {
        id: configId,
        projectId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Configuration non trouvée');
    }

    await this.prisma.config.delete({
      where: { id: configId },
    });

    // Invalidate env config cache for all environments of this project
    this.envConfigsService.invalidateCache(projectId);
  }

  /** @deprecated Use EnvConfigsService.getMergedDecrypted() which includes env-specific overrides. */
  async getDecrypted(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<Record<string, string>> {
    await this.permissions.assertCanAccess(projectId, userId, userRole);

    const configs = await this.prisma.config.findMany({
      where: { projectId },
    });

    const result: Record<string, string> = {};
    for (const config of configs) {
      result[config.key] = config.isSecret
        ? this.decrypt(config.value)
        : config.value;
    }

    return result;
  }

  private toPublic(config: Config): ConfigPublic {
    return {
      ...config,
      value: config.isSecret ? '***' : config.value,
    };
  }

  private encrypt(value: string): string {
    return this.crypto.encrypt(value);
  }

  private decrypt(value: string): string {
    return this.crypto.decrypt(value);
  }

}
