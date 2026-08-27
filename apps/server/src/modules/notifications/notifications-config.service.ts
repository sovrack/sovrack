import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';

export const CONFIG_KEYS = {
  SLACK_WEBHOOK: 'SLACK_WEBHOOK_URL',
  NOTIFY_ON_SUCCESS: 'NOTIFY_ON_SUCCESS',
  NOTIFY_ON_FAILURE: 'NOTIFY_ON_FAILURE',
  SMTP_CONFIG_SOURCE: 'SMTP_CONFIG_SOURCE',
  SMTP_ENABLED: 'SMTP_ENABLED',
  SMTP_HOST: 'SMTP_HOST',
  SMTP_PORT: 'SMTP_PORT',
  SMTP_SECURITY: 'SMTP_SECURITY',
  SMTP_SECURE: 'SMTP_SECURE',
  SMTP_USER: 'SMTP_USER',
  SMTP_PASS: 'SMTP_PASS',
  SMTP_FROM: 'SMTP_FROM',
  SMTP_TO: 'SMTP_TO',
} as const;

export type SmtpSecurityMode = 'none' | 'starttls' | 'tls';
export type SmtpConfigSource = 'database' | 'environment' | 'none';

type CacheEntry = { value: string | null; expiresAt: number };

export type SmtpRuntimeConfig = {
  enabled: boolean;
  source: SmtpConfigSource;
  host: string;
  port: number;
  security: SmtpSecurityMode;
  user: string;
  pass: string;
  from: string;
  to: string;
};

export type StaffEmailSettingsView = Omit<SmtpRuntimeConfig, 'pass'> & {
  passwordConfigured: boolean;
};

export type UpdateStaffEmailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  security: SmtpSecurityMode;
  user?: string;
  password?: string;
  clearPassword?: boolean;
  from: string;
  to?: string;
};

export type NotificationsSettings = {
  slackWebhookUrl: string;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SmtpSecurityMode;
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
    private readonly environment: ConfigService,
  ) {}

  async get(key: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now < cached.expiresAt) return cached.value;

    const record = await this.prisma.platformConfig.findUnique({
      where: { key },
    });
    const databaseValue = this.readRecord(record);
    const value =
      databaseValue ?? this.environment.get<string>(key)?.trim() ?? null;

    this.cache.set(key, { value: value || null, expiresAt: now + 60_000 });
    return value || null;
  }

  /** Resolve one complete SMTP snapshot from one source (never mixed keys). */
  async getSmtpRuntimeConfig(): Promise<SmtpRuntimeConfig> {
    const K = CONFIG_KEYS;
    const [sourceRecord, legacyHostRecord] = await Promise.all([
      this.prisma.platformConfig.findUnique({
        where: { key: K.SMTP_CONFIG_SOURCE },
      }),
      this.prisma.platformConfig.findUnique({ where: { key: K.SMTP_HOST } }),
    ]);
    const sourceValue = this.readRecord(sourceRecord)?.toLowerCase();
    const legacyHostValue = this.readRecord(legacyHostRecord)?.trim();
    const useDatabase =
      sourceValue === 'database' ||
      (sourceValue !== 'environment' && Boolean(legacyHostValue));
    const read = useDatabase
      ? (key: string) => this.getDatabaseValue(key)
      : (key: string) =>
          Promise.resolve(this.environment.get<string>(key)?.trim() || null);

    const [
      enabledValue,
      host,
      portValue,
      securityValue,
      secureLegacy,
      user,
      pass,
      from,
      to,
    ] = await Promise.all([
      read(K.SMTP_ENABLED),
      read(K.SMTP_HOST),
      read(K.SMTP_PORT),
      read(K.SMTP_SECURITY),
      read(K.SMTP_SECURE),
      read(K.SMTP_USER),
      read(K.SMTP_PASS),
      read(K.SMTP_FROM),
      read(K.SMTP_TO),
    ]);

    const port = this.parsePort(portValue);
    const security = this.parseSecurity(securityValue, secureLegacy, port);
    const configured = Boolean(host);
    return {
      enabled: configured && enabledValue?.toLowerCase() !== 'false',
      source: configured ? (useDatabase ? 'database' : 'environment') : 'none',
      host: host ?? '',
      port,
      security,
      user: user ?? '',
      pass: pass ?? '',
      from: from ?? '',
      to: to ?? '',
    };
  }

  async getStaffEmailSettings(): Promise<StaffEmailSettingsView> {
    const config = await this.getSmtpRuntimeConfig();
    const { pass, ...safe } = config;
    return { ...safe, passwordConfigured: Boolean(pass) };
  }

  /** Persist a complete database-owned SMTP configuration atomically. */
  async saveStaffEmailSettings(
    settings: UpdateStaffEmailSettings,
  ): Promise<StaffEmailSettingsView> {
    this.validateEmailSettings(settings);
    const existingPassword = await this.getDatabaseValue(CONFIG_KEYS.SMTP_PASS);
    const authenticationRequired = Boolean(settings.user?.trim());
    if (
      settings.enabled &&
      authenticationRequired &&
      (settings.clearPassword || (!settings.password && !existingPassword))
    ) {
      throw new BadRequestException(
        'Un mot de passe SMTP est requis pour activer la configuration',
      );
    }

    const values: Array<{
      key: string;
      value: string;
      isSecret?: boolean;
    }> = [
      { key: CONFIG_KEYS.SMTP_CONFIG_SOURCE, value: 'database' },
      { key: CONFIG_KEYS.SMTP_ENABLED, value: String(settings.enabled) },
      { key: CONFIG_KEYS.SMTP_HOST, value: settings.host.trim() },
      { key: CONFIG_KEYS.SMTP_PORT, value: String(settings.port) },
      { key: CONFIG_KEYS.SMTP_SECURITY, value: settings.security },
      { key: CONFIG_KEYS.SMTP_USER, value: settings.user?.trim() ?? '' },
      { key: CONFIG_KEYS.SMTP_FROM, value: settings.from.trim() },
      { key: CONFIG_KEYS.SMTP_TO, value: settings.to?.trim() ?? '' },
    ];
    if (settings.password) {
      values.push({
        key: CONFIG_KEYS.SMTP_PASS,
        value: this.crypto.encrypt(settings.password),
        isSecret: true,
      });
    }

    await this.prisma.$transaction(async (transaction) => {
      await Promise.all(
        values.map(({ key, value, isSecret = false }) =>
          transaction.platformConfig.upsert({
            where: { key },
            create: { key, value, isSecret },
            update: { value, isSecret },
          }),
        ),
      );
      if (settings.clearPassword) {
        await transaction.platformConfig.deleteMany({
          where: { key: CONFIG_KEYS.SMTP_PASS },
        });
      }
    });
    this.clearCache();
    return this.getStaffEmailSettings();
  }

  async getSettings(): Promise<NotificationsSettings> {
    const [webhookUrl, notifySuccess, notifyFailure, smtp] = await Promise.all([
      this.get(CONFIG_KEYS.SLACK_WEBHOOK),
      this.get(CONFIG_KEYS.NOTIFY_ON_SUCCESS),
      this.get(CONFIG_KEYS.NOTIFY_ON_FAILURE),
      this.getSmtpRuntimeConfig(),
    ]);
    return {
      slackWebhookUrl: webhookUrl ?? '',
      notifyOnSuccess: notifySuccess !== 'false',
      notifyOnFailure: notifyFailure !== 'false',
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      smtpSecurity: smtp.security,
      smtpUser: smtp.user,
      smtpPass: smtp.pass,
      smtpFrom: smtp.from,
      smtpTo: smtp.to,
    };
  }

  /** Legacy internal settings writer; the customer-facing controller is off. */
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
      if (typeof value !== 'string') return;
      if (value.trim()) await upsert(key, value.trim(), isSecret);
      else await this.prisma.platformConfig.deleteMany({ where: { key } });
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
      ...(settings.smtpSecurity
        ? [upsert(K.SMTP_SECURITY, settings.smtpSecurity)]
        : []),
      deleteIfEmpty(K.SMTP_USER, settings.smtpUser),
      deleteIfEmpty(K.SMTP_PASS, settings.smtpPass, true),
      deleteIfEmpty(K.SMTP_FROM, settings.smtpFrom),
      deleteIfEmpty(K.SMTP_TO, settings.smtpTo),
      ...(Object.keys(settings).some((key) => key.startsWith('smtp'))
        ? [upsert(K.SMTP_CONFIG_SOURCE, 'database')]
        : []),
    ]);
    this.clearCache();
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async getDatabaseValue(key: string): Promise<string | null> {
    const record = await this.prisma.platformConfig.findUnique({
      where: { key },
    });
    return this.readRecord(record);
  }

  private readRecord(
    record: { value: string; isSecret: boolean } | null,
  ): string | null {
    if (!record) return null;
    if (!record.isSecret) return record.value;
    try {
      return this.crypto.decrypt(record.value);
    } catch {
      return null;
    }
  }

  private parsePort(value: string | null): number {
    const port = value ? Number(value) : 587;
    return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : 587;
  }

  private parseSecurity(
    value: string | null,
    legacySecure: string | null,
    port: number,
  ): SmtpSecurityMode {
    if (value === 'none' || value === 'starttls' || value === 'tls') {
      return value;
    }
    if (
      legacySecure &&
      ['true', '1', 'yes'].includes(legacySecure.toLowerCase())
    ) {
      return 'tls';
    }
    return port === 465 ? 'tls' : 'starttls';
  }

  private validateEmailSettings(settings: UpdateStaffEmailSettings): void {
    const host = settings.host.trim();
    if (settings.enabled && !host) {
      throw new BadRequestException('SMTP_HOST est requis');
    }
    if (
      host &&
      !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)
    ) {
      throw new BadRequestException('Nom d’hôte SMTP invalide');
    }
    if (
      !Number.isInteger(settings.port) ||
      settings.port < 1 ||
      settings.port > 65_535
    ) {
      throw new BadRequestException('Port SMTP invalide');
    }
    if (settings.enabled && !settings.from.trim()) {
      throw new BadRequestException('L’expéditeur SMTP est requis');
    }
    const allowedHosts = (
      this.environment.get<string>('SMTP_ALLOWED_HOSTS') ?? ''
    )
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      host &&
      allowedHosts.length > 0 &&
      !allowedHosts.includes(host.toLowerCase())
    ) {
      throw new BadRequestException(
        'Cet hôte SMTP n’est pas autorisé par SMTP_ALLOWED_HOSTS',
      );
    }
  }
}
