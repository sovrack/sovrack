import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
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
  };
  let crypto: { decrypt: jest.Mock; encrypt: jest.Mock };
  let service: NotificationsConfigService;
  let db: ConfigMap;

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
    };
    crypto = {
      decrypt: jest.fn((v: string) => `dec:${v}`),
      encrypt: jest.fn((v: string) => `enc:${v}`),
    };
    service = new NotificationsConfigService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
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
      db[CONFIG_KEYS.SMTP_PORT] = { value: '465', isSecret: false };
      const s = await service.getSettings();
      expect(s.smtpPort).toBe(465);
    });
  });

  describe('saveSettings', () => {
    it('upserts slackWebhookUrl as secret', async () => {
      await service.saveSettings({ slackWebhookUrl: 'https://hooks/x' });
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
