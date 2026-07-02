import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type PlatformConfig } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';

type PlatformConfigPublic = Omit<PlatformConfig, 'value'> & { value: string };

/**
 * Webhook configuration: where this platform is reachable from the public internet.
 * Used by Git providers (GitHub, GitLab) to register webhooks.
 *
 * Resolution order (per Coolify/Dokploy pattern):
 *   1. `PlatformConfig.WEBHOOK_BASE_URL` (DB, settable via UI) — preferred
 *   2. Env var `WEBHOOK_URL` — kept as a transient legacy fallback
 *   3. `null` — caller decides whether to throw, warn, or disable auto-config
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly configService: ConfigService,
  ) {}

  async get(key: string): Promise<string | null> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { key },
    });
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

  /**
   * Resolve the public base URL of this platform — used to build webhook URLs.
   * Returns `null` if not configured (caller decides how to handle).
   */
  async resolveWebhookBaseUrl(): Promise<string | null> {
    const fromDb = await this.get('WEBHOOK_BASE_URL');
    if (fromDb?.trim()) {
      return fromDb.trim();
    }
    const fromEnv = this.configService.get<string>('WEBHOOK_URL', '').trim();
    if (fromEnv) {
      return fromEnv;
    }
    return null;
  }

  /**
   * Build a fully qualified webhook URL for a given provider + endpoint.
   * Throws BadRequestException if no base URL is configured AND the caller
   * explicitly demands a value (defaults to throwing).
   */
  async buildWebhookUrl(
    endpointPath: string,
    options: { throwIfMissing?: boolean } = { throwIfMissing: true },
  ): Promise<string> {
    const base = await this.resolveWebhookBaseUrl();
    if (!base) {
      if (options.throwIfMissing) {
        throw new NotFoundException(
          'WEBHOOK_BASE_URL non configurée. ' +
            'Définissez-la dans Réglages → Plateforme → URL publique du backend.',
        );
      }
      return '';
    }
    const normalized = base.replace(/\/+$/, '');
    const cleanPath = endpointPath.replace(/^\/+/, '');
    return `${normalized}/${cleanPath}`;
  }

  async set(
    key: string,
    value: string,
    isSecret?: boolean,
  ): Promise<PlatformConfigPublic> {
    const existing = await this.prisma.platformConfig.findUnique({
      where: { key },
    });
    const nextIsSecret = isSecret ?? existing?.isSecret ?? false;
    const isMaskedValue = value === '***';

    let valueToPersist = value;
    if (existing?.isSecret && isMaskedValue) {
      valueToPersist = nextIsSecret
        ? existing.value
        : this.crypto.decrypt(existing.value);
    } else if (nextIsSecret) {
      valueToPersist = this.crypto.encrypt(value);
    }

    const saved = await this.prisma.platformConfig.upsert({
      where: { key },
      update: { value: valueToPersist, isSecret: nextIsSecret },
      create: { key, value: valueToPersist, isSecret: nextIsSecret },
    });

    this.logger.log(
      `Platform config "${key}" updated (isSecret: ${String(nextIsSecret)})`,
    );

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
