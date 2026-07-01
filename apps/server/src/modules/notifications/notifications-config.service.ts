import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';

export const CONFIG_KEYS = {
  SLACK_WEBHOOK: 'SLACK_WEBHOOK_URL',
  NOTIFY_ON_SUCCESS: 'NOTIFY_ON_SUCCESS',
  NOTIFY_ON_FAILURE: 'NOTIFY_ON_FAILURE',
  SMTP_HOST: 'SMTP_HOST',
  SMTP_PORT: 'SMTP_PORT',
  SMTP_USER: 'SMTP_USER',
  SMTP_PASS: 'SMTP_PASS',
  SMTP_FROM: 'SMTP_FROM',
  SMTP_TO: 'SMTP_TO',
} as const;

type CacheEntry = { value: string | null; expiresAt: number };

export type NotificationsSettings = {
  slackWebhookUrl: string;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpTo: string;
};

@Injectable()
export class NotificationsConfigService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async get(key: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now < cached.expiresAt) return cached.value;

    const record = await this.prisma.platformConfig.findUnique({
      where: { key },
    });
    let value: string | null = null;
    if (record) {
      if (record.isSecret) {
        try {
          value = this.crypto.decrypt(record.value);
        } catch {
          value = null;
        }
      } else {
        value = record.value;
      }
    }
    this.cache.set(key, { value, expiresAt: now + 60_000 });
    return value;
  }

  async getSettings(): Promise<NotificationsSettings> {
    const K = CONFIG_KEYS;
    const [
      webhookUrl,
      notifySuccess,
      notifyFailure,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom,
      smtpTo,
    ] = await Promise.all([
      this.get(K.SLACK_WEBHOOK),
      this.get(K.NOTIFY_ON_SUCCESS),
      this.get(K.NOTIFY_ON_FAILURE),
      this.get(K.SMTP_HOST),
      this.get(K.SMTP_PORT),
      this.get(K.SMTP_USER),
      this.get(K.SMTP_PASS),
      this.get(K.SMTP_FROM),
      this.get(K.SMTP_TO),
    ]);
    return {
      slackWebhookUrl: webhookUrl ?? '',
      notifyOnSuccess: notifySuccess !== 'false',
      notifyOnFailure: notifyFailure !== 'false',
      smtpHost: smtpHost ?? '',
      smtpPort: smtpPort ? parseInt(smtpPort, 10) : 587,
      smtpUser: smtpUser ?? '',
      smtpPass: smtpPass ?? '',
      smtpFrom: smtpFrom ?? '',
      smtpTo: smtpTo ?? '',
    };
  }

  async saveSettings(
    settings: Partial<
      Omit<NotificationsSettings, 'notifyOnSuccess' | 'notifyOnFailure'>
    > & {
      notifyOnSuccess?: boolean;
      notifyOnFailure?: boolean;
    },
  ): Promise<void> {
    const K = CONFIG_KEYS;

    const upsert = async (key: string, value: string, isSecret = false) => {
      const stored = isSecret ? this.crypto.encrypt(value) : value;
      await this.prisma.platformConfig.upsert({
        where: { key },
        create: { key, value: stored, isSecret },
        update: { value: stored, isSecret },
      });
    };

    const deleteIfEmpty = async (
      key: string,
      value: string | undefined,
      isSecret = false,
    ) => {
      if (typeof value === 'string') {
        if (value.trim()) await upsert(key, value.trim(), isSecret);
        else await this.prisma.platformConfig.deleteMany({ where: { key } });
      }
    };

    await Promise.all([
      deleteIfEmpty(K.SLACK_WEBHOOK, settings.slackWebhookUrl, true),
      ...(typeof settings.notifyOnSuccess === 'boolean'
        ? [upsert(K.NOTIFY_ON_SUCCESS, String(settings.notifyOnSuccess))]
        : []),
      ...(typeof settings.notifyOnFailure === 'boolean'
        ? [upsert(K.NOTIFY_ON_FAILURE, String(settings.notifyOnFailure))]
        : []),
      deleteIfEmpty(K.SMTP_HOST, settings.smtpHost),
      ...(typeof settings.smtpPort === 'number'
        ? [upsert(K.SMTP_PORT, String(settings.smtpPort))]
        : []),
      deleteIfEmpty(K.SMTP_USER, settings.smtpUser),
      deleteIfEmpty(K.SMTP_PASS, settings.smtpPass, true),
      deleteIfEmpty(K.SMTP_FROM, settings.smtpFrom),
      deleteIfEmpty(K.SMTP_TO, settings.smtpTo),
    ]);
  }
}
