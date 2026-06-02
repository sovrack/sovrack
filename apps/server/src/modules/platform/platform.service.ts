import { Injectable, NotFoundException } from '@nestjs/common';
import { type PlatformConfig } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CryptoService } from '../../core/crypto/crypto.service';

type PlatformConfigPublic = Omit<PlatformConfig, 'value'> & { value: string };

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async get(key: string): Promise<string | null> {
    const config = await this.prisma.platformConfig.findUnique({ where: { key } });
    if (!config) return null;
    return config.isSecret ? this.crypto.decrypt(config.value) : config.value;
  }

  async getOrFail(key: string): Promise<string> {
    const value = await this.get(key);
    if (value === null) {
      throw new NotFoundException(`Configuration "${key}" non trouvée`);
    }
    return value;
  }

  async set(
    key: string,
    value: string,
    isSecret?: boolean,
  ): Promise<PlatformConfigPublic> {
    const existing = await this.prisma.platformConfig.findUnique({ where: { key } });
    const nextIsSecret = isSecret ?? existing?.isSecret ?? false;
    const isMaskedValue = value === '***';

    let valueToPersist = value;
    if (existing?.isSecret && isMaskedValue) {
      valueToPersist = nextIsSecret ? existing.value : this.crypto.decrypt(existing.value);
    } else if (nextIsSecret) {
      valueToPersist = this.crypto.encrypt(value);
    }

    const saved = await this.prisma.platformConfig.upsert({
      where: { key },
      update: { value: valueToPersist, isSecret: nextIsSecret },
      create: { key, value: valueToPersist, isSecret: nextIsSecret },
    });

    return this.toPublic(saved);
  }

  async getAll(): Promise<PlatformConfigPublic[]> {
    const configs = await this.prisma.platformConfig.findMany({
      orderBy: { key: 'asc' },
    });
    return configs.map((item) => this.toPublic(item));
  }

  private toPublic(config: PlatformConfig): PlatformConfigPublic {
    return {
      ...config,
      value: config.isSecret ? '***' : config.value,
    };
  }
}
