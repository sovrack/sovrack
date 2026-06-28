import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RegistryProviderType, type RegistryConfig } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { RegistryConnectionTesterService } from './registry-connection-tester.service';

export type RegistryConfigPublic = {
  id: string;
  name: string;
  type: RegistryProviderType;
  username: string;
  registryUrl: string;
  isDefault: boolean;
  isConnected: boolean;
  connectionError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertRegistryConfigInput = {
  name: string;
  type: RegistryProviderType;
  username?: string;
  password?: string;
  registryUrl?: string;
  isDefault?: boolean;
};

export type PatchRegistryConfigInput = {
  name?: string;
  type?: RegistryProviderType;
  username?: string;
  password?: string;
  registryUrl?: string;
  isDefault?: boolean;
};

@Injectable()
export class ContainerRegistriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly connectionTester: RegistryConnectionTesterService,
  ) {}

  async listRegistryConfigs(): Promise<RegistryConfigPublic[]> {
    const registries = await this.prisma.registryConfig.findMany({
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return registries.map((r) => this.toPublic(r));
  }

  async createRegistryConfig(
    input: UpsertRegistryConfigInput,
  ): Promise<RegistryConfigPublic> {
    const name = this.requireNonEmpty(input.name, 'Name est requis');
    const type = input.type;

    const count = await this.prisma.registryConfig.count({ where: { type } });
    const shouldBeDefault = count === 0 ? true : input.isDefault === true;

    if (shouldBeDefault) {
      await this.prisma.registryConfig.updateMany({
        where: { type, isDefault: true },
        data: { isDefault: false },
      });
    }

    const registry = await this.prisma.registryConfig.create({
      data: {
        name,
        type,
        username: this.normalizeOptional(input.username),
        password: this.crypto.encryptOptional(input.password),
        registryUrl: this.normalizeOptional(input.registryUrl),
        isDefault: shouldBeDefault,
        isConnected: false,
      },
    });

    return this.toPublic(registry);
  }

  async updateRegistryConfig(
    id: string,
    input: PatchRegistryConfigInput,
  ): Promise<RegistryConfigPublic> {
    const current = await this.getOrFail(id);
    const data: Partial<RegistryConfig> = {};

    if (typeof input.name === 'string')
      data.name = this.requireNonEmpty(input.name, 'Name est requis');
    if (typeof input.type !== 'undefined') data.type = input.type;
    if (typeof input.username === 'string')
      data.username = this.normalizeOptional(input.username);
    if (typeof input.password === 'string')
      data.password = this.crypto.encryptOptional(input.password);
    if (typeof input.registryUrl === 'string')
      data.registryUrl = this.normalizeOptional(input.registryUrl);

    if (input.isDefault === true && !current.isDefault) {
      await this.prisma.registryConfig.updateMany({
        where: { type: current.type, isDefault: true },
        data: { isDefault: false },
      });
      data.isDefault = true;
    }

    const updated = await this.prisma.registryConfig.update({
      where: { id },
      data,
    });
    return this.toPublic(updated);
  }

  async deleteRegistryConfig(id: string): Promise<void> {
    const registry = await this.getOrFail(id);
    await this.prisma.registryConfig.delete({ where: { id } });

    if (registry.isDefault) {
      const replacement = await this.prisma.registryConfig.findFirst({
        where: { type: registry.type },
        orderBy: { createdAt: 'asc' },
      });
      if (replacement) {
        await this.prisma.registryConfig.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        });
      }
    }
  }

  async setDefaultRegistryConfig(id: string): Promise<RegistryConfigPublic> {
    const current = await this.getOrFail(id);
    await this.prisma.$transaction([
      this.prisma.registryConfig.updateMany({
        where: { type: current.type, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.registryConfig.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);
    const updated = await this.getOrFail(id);
    return this.toPublic(updated);
  }

  async testRegistryConnection(
    id: string,
  ): Promise<{ ok: boolean; message: string }> {
    const registry = await this.getOrFail(id);
    return this.connectionTester.test(registry);
  }

  private async getOrFail(id: string): Promise<RegistryConfig> {
    const registry = await this.prisma.registryConfig.findUnique({
      where: { id },
    });
    if (!registry) throw new NotFoundException(`Registry "${id}" non trouvée`);
    return registry;
  }

  private toPublic(registry: RegistryConfig): RegistryConfigPublic {
    return {
      id: registry.id,
      name: registry.name,
      type: registry.type,
      username: registry.username ?? '',
      registryUrl: registry.registryUrl ?? '',
      isDefault: registry.isDefault,
      isConnected: registry.isConnected,
      connectionError: registry.connectionError,
      createdAt: registry.createdAt.toISOString(),
      updatedAt: registry.updatedAt.toISOString(),
    };
  }

  private requireNonEmpty(value: string, errorMessage: string): string {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(errorMessage);
    return normalized;
  }

  private normalizeOptional(value?: string | null): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
