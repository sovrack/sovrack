import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { ConfigService } from '@nestjs/config';
import {
  NotificationsConfigService,
  CONFIG_KEYS,
} from './notifications-config.service';

type ConfigMap = Record<string, { value: string; isSecret: boolean }>;

describe('NotificationsConfigService', () => {
  let prisma: {
    platformConfig: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let crypto: { decrypt: jest.Mock; encrypt: jest.Mock };
  let service: NotificationsConfigService;
  let db: ConfigMap;
  let environment: { get: jest.Mock };

  beforeEach(() => {
    db = {};
    prisma = {
      platformConfig: {
        findUnique: jest.fn(({ where: { key } }: { where: { key: string } }) =>
          Promise.resolve(db[key] ? { key, ...db[key] } : null),
        ),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(
        async (
          callback: (transaction: {
            platformConfig: typeof prisma.platformConfig;
          }) => Promise<unknown>,
        ) => callback(prisma),
      ),
    };
    crypto = {
      decrypt: jest.fn((v: string) => `dec:${v}`),
      encrypt: jest.fn((v: string) => `enc:${v}`),
    };
    environment = { get: jest.fn().mockReturnValue(undefined) };
    service = new NotificationsConfigService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
      environment as unknown as ConfigService,
    );
  });

  describe('get', () => {
    it('returns plaintext value for non-secret', async () => {
      db['KEY'] = { value: 'hello', isSecret: false };
      await expect(service.get('KEY')).resolves.toBe('hello');
    });

    it('decrypts a secret value', async () => {
      db['KEY'] = { value: 'enc', isSecret: true };
      await expect(service.get('KEY')).resolves.toBe('dec:enc');
    });

    it('returns null when key is absent', async () => {
      await expect(service.get('MISSING')).resolves.toBeNull();
    });

    it('falls back to the runtime environment when the database key is absent', async () => {
      environment.get.mockImplementation((key: string) =>
        key === CONFIG_KEYS.SMTP_HOST ? 'mailpit' : undefined,
      );
      await expect(service.get(CONFIG_KEYS.SMTP_HOST)).resolves.toBe('mailpit');
    });

    it('keeps a database value authoritative over the environment', async () => {
      db[CONFIG_KEYS.SMTP_HOST] = { value: 'smtp.database', isSecret: false };
      environment.get.mockReturnValue('smtp.environment');
      await expect(service.get(CONFIG_KEYS.SMTP_HOST)).resolves.toBe(
        'smtp.database',
      );
    });

    it('returns null when decryption throws', async () => {
      db['KEY'] = { value: 'bad', isSecret: true };
      crypto.decrypt.mockImplementation(() => {
        throw new Error('bad key');
      });
      await expect(service.get('KEY')).resolves.toBeNull();
    });

    it('uses TTL cache on second call', async () => {
      db['KEY'] = { value: 'v', isSecret: false };
      await service.get('KEY');
      await service.get('KEY');
      expect(prisma.platformConfig.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSettings', () => {
    it('returns defaults when nothing is configured', async () => {
      const s = await service.getSettings();
      expect(s.slackWebhookUrl).toBe('');
      expect(s.notifyOnSuccess).toBe(true);
      expect(s.notifyOnFailure).toBe(true);
      expect(s.smtpPort).toBe(587);
    });

    it('parses notifyOnSuccess=false correctly', async () => {
      db[CONFIG_KEYS.NOTIFY_ON_SUCCESS] = { value: 'false', isSecret: false };
      const s = await service.getSettings();
      expect(s.notifyOnSuccess).toBe(false);
    });

    it('parses custom SMTP port', async () => {
      db[CONFIG_KEYS.SMTP_CONFIG_SOURCE] = {
        value: 'database',
        isSecret: false,
      };
      db[CONFIG_KEYS.SMTP_HOST] = {
        value: 'smtp.database',
        isSecret: false,
      };
      db[CONFIG_KEYS.SMTP_PORT] = { value: '465', isSecret: false };
      const s = await service.getSettings();
      expect(s.smtpPort).toBe(465);
      expect(s.smtpSecurity).toBe('tls');
    });
  });

  describe('staff email settings', () => {
    it('ignores an empty legacy database host and keeps the environment snapshot', async () => {
      db[CONFIG_KEYS.SMTP_HOST] = { value: '   ', isSecret: false };
      environment.get.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          [CONFIG_KEYS.SMTP_CONFIG_SOURCE]: 'environment',
          [CONFIG_KEYS.SMTP_ENABLED]: 'true',
          [CONFIG_KEYS.SMTP_HOST]: 'mailpit',
          [CONFIG_KEYS.SMTP_PORT]: '1025',
          [CONFIG_KEYS.SMTP_SECURITY]: 'none',
          [CONFIG_KEYS.SMTP_FROM]: 'noreply@sovrack.local',
        };
        return values[key];
      });

      await expect(service.getSmtpRuntimeConfig()).resolves.toEqual(
        expect.objectContaining({
          source: 'environment',
          host: 'mailpit',
          port: 1025,
        }),
      );
    });

    it('never returns the decrypted password', async () => {
      db[CONFIG_KEYS.SMTP_CONFIG_SOURCE] = {
        value: 'database',
        isSecret: false,
      };
      db[CONFIG_KEYS.SMTP_HOST] = { value: 'smtp.local', isSecret: false };
      db[CONFIG_KEYS.SMTP_PASS] = { value: 'ciphertext', isSecret: true };

      const settings = await service.getStaffEmailSettings();

      expect(settings.passwordConfigured).toBe(true);
      expect(settings).not.toHaveProperty('pass');
    });

    it('allows an unauthenticated local SMTP relay', async () => {
      await expect(
        service.saveStaffEmailSettings({
          enabled: true,
          host: 'mailpit',
          port: 1025,
          security: 'none',
          user: '',
          from: 'noreply@sovrack.local',
          to: 'root@sovrack.local',
        }),
      ).resolves.toEqual(
        expect.objectContaining({ passwordConfigured: false }),
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('requires a password when authenticated SMTP is enabled', async () => {
      await expect(
        service.saveStaffEmailSettings({
          enabled: true,
          host: 'smtp.provider.test',
          port: 587,
          security: 'starttls',
          user: 'apikey',
          from: 'contact@sovrack.com',
        }),
      ).rejects.toThrow('mot de passe SMTP');
    });
  });

  describe('saveSettings', () => {
    it('upserts slackWebhookUrl as secret', async () => {
      await service.saveSettings({
        slackWebhookUrl: 'https://hooks.slack.com/services/test',
      });
      expect(prisma.platformConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: CONFIG_KEYS.SLACK_WEBHOOK },
          create: expect.objectContaining({ isSecret: true }),
        }),
      );
    });

    it('deletes slack key when value is empty string', async () => {
      await service.saveSettings({ slackWebhookUrl: '' });
      expect(prisma.platformConfig.deleteMany).toHaveBeenCalledWith({
        where: { key: CONFIG_KEYS.SLACK_WEBHOOK },
      });
    });

    it('encrypts SMTP pass', async () => {
      await service.saveSettings({ smtpPass: 'secret123' });
      expect(crypto.encrypt).toHaveBeenCalledWith('secret123');
    });

    it('upserts boolean flags as strings', async () => {
      await service.saveSettings({ notifyOnSuccess: false });
      expect(prisma.platformConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: CONFIG_KEYS.NOTIFY_ON_SUCCESS },
          create: expect.objectContaining({ value: 'false' }),
        }),
      );
    });
  });
});
