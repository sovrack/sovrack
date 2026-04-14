import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { type PlatformConfig } from '@prisma/client';
import * as CryptoJS from 'crypto-js';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

type PlatformConfigPublic = Omit<PlatformConfig, 'value'> & { value: string };

@Injectable()
export class PlatformConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  async get(key: string): Promise<string | null> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { key },
    });

    if (!config) {
      return null;
    }

    return config.isSecret ? this.decrypt(config.value) : config.value;
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
    const existing = await this.prisma.platformConfig.findUnique({
      where: { key },
    });

    // Si le client ne précise pas isSecret, on conserve l'état actuel.
    const nextIsSecret = isSecret ?? existing?.isSecret ?? false;
    const isMaskedValue = value === '***';

    let valueToPersist = value;

    if (existing?.isSecret && isMaskedValue) {
      if (nextIsSecret) {
        valueToPersist = existing.value;
      } else {
        // Conversion explicite secret -> non secret: on stocke la valeur déchiffrée.
        valueToPersist = this.decrypt(existing.value);
      }
    } else if (nextIsSecret) {
      valueToPersist = this.encrypt(value);
    }

    const saved = await this.prisma.platformConfig.upsert({
      where: { key },
      update: {
        value: valueToPersist,
        isSecret: nextIsSecret,
      },
      create: {
        key,
        value: valueToPersist,
        isSecret: nextIsSecret,
      },
    });

    return this.toPublic(saved);
  }

  async getAll(): Promise<PlatformConfigPublic[]> {
    const configs = await this.prisma.platformConfig.findMany({
      orderBy: { key: 'asc' },
    });

    return configs.map((item) => this.toPublic(item));
  }

  async testGitlab(): Promise<{ ok: boolean; message: string }> {
    const gitlabUrl = await this.getOrFail('GITLAB_URL');
    const gitlabToken = await this.getOrFail('GITLAB_TOKEN');

    if (!gitlabUrl.trim() || !gitlabToken.trim()) {
      throw new BadRequestException(
        'GITLAB_URL et GITLAB_TOKEN doivent être configurés',
      );
    }

    const normalizedUrl = gitlabUrl.trim().replace(/\/+$/, '');

    try {
      await firstValueFrom(
        this.httpService.get(`${normalizedUrl}/api/v4/user`, {
          headers: {
            'PRIVATE-TOKEN': gitlabToken,
          },
        }),
      );

      return {
        ok: true,
        message: 'Connexion GitLab globale valide',
      };
    } catch {
      throw new BadRequestException('Test GitLab échoué');
    }
  }

  private toPublic(config: PlatformConfig): PlatformConfigPublic {
    return {
      ...config,
      value: config.isSecret ? '***' : config.value,
    };
  }

  private encrypt(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }

    return CryptoJS.AES.encrypt(value, secret).toString();
  }

  private decrypt(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }

    return CryptoJS.AES.decrypt(value, secret).toString(CryptoJS.enc.Utf8);
  }
}
