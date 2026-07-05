import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { PlatformService } from './platform.service';

function makeSvc(
  opts: {
    record?: { key: string; value: string; isSecret: boolean } | null;
    allRecords?: { key: string; value: string; isSecret: boolean }[];
    webhookUrl?: string;
  } = {},
) {
  const record = 'record' in opts ? opts.record : null;

  const prisma = {
    platformConfig: {
      findUnique: jest.fn().mockResolvedValue(record),
      findMany: jest.fn().mockResolvedValue(opts.allRecords ?? []),
      upsert: jest
        .fn()
        .mockImplementation(({ create }: { create: unknown }) =>
          Promise.resolve(create),
        ),
    },
  } as unknown as PrismaService;

  const crypto = {
    decrypt: jest.fn((v: string) => `dec:${v}`),
    encrypt: jest.fn((v: string) => `enc:${v}`),
  } as unknown as CryptoService;

  const configService = {
    get: jest.fn().mockReturnValue(opts.webhookUrl ?? ''),
  } as unknown as ConfigService;

  const svc = new PlatformService(prisma, crypto, configService);
  return { svc, prisma, crypto, configService };
}

describe('PlatformService', () => {
  describe('get', () => {
    it('returns null when key is not found', async () => {
      const { svc } = makeSvc({ record: null });
      expect(await svc.get('MISSING')).toBeNull();
    });

    it('returns plaintext value for non-secret config', async () => {
      const { svc } = makeSvc({
        record: { key: 'THEME', value: 'dark', isSecret: false },
      });
      expect(await svc.get('THEME')).toBe('dark');
    });

    it('decrypts the value for secret config', async () => {
      const { svc } = makeSvc({
        record: { key: 'SECRET_KEY', value: 'enc-value', isSecret: true },
      });
      expect(await svc.get('SECRET_KEY')).toBe('dec:enc-value');
    });
  });

  describe('getOrFail', () => {
    it('throws NotFoundException when key is missing', async () => {
      const { svc } = makeSvc({ record: null });
      await expect(svc.getOrFail('MISSING')).rejects.toThrow(NotFoundException);
    });

    it('returns value when key exists', async () => {
      const { svc } = makeSvc({
        record: {
          key: 'WEBHOOK',
          value: 'https://api.example.com',
          isSecret: false,
        },
      });
      expect(await svc.getOrFail('WEBHOOK')).toBe('https://api.example.com');
    });
  });

  describe('resolveWebhookBaseUrl', () => {
    it('returns DB value when WEBHOOK_BASE_URL is set', async () => {
      const { svc } = makeSvc({
        record: {
          key: 'WEBHOOK_BASE_URL',
          value: 'https://platform.io',
          isSecret: false,
        },
      });
      expect(await svc.resolveWebhookBaseUrl()).toBe('https://platform.io');
    });

    it('falls back to env var when DB value is absent', async () => {
      const { svc } = makeSvc({
        record: null,
        webhookUrl: 'https://env.example.com',
      });
      expect(await svc.resolveWebhookBaseUrl()).toBe('https://env.example.com');
    });

    it('returns null when neither DB nor env var is set', async () => {
      const { svc } = makeSvc({ record: null, webhookUrl: '' });
      expect(await svc.resolveWebhookBaseUrl()).toBeNull();
    });
  });

  describe('buildWebhookUrl', () => {
    it('builds a webhook URL from the base', async () => {
      const { svc } = makeSvc({
        record: {
          key: 'WEBHOOK_BASE_URL',
          value: 'https://platform.io',
          isSecret: false,
        },
      });
      const url = await svc.buildWebhookUrl('/api/webhooks/inbound');
      expect(url).toBe('https://platform.io/api/webhooks/inbound');
    });

    it('strips trailing slash from base and leading slash from path', async () => {
      const { svc } = makeSvc({
        record: {
          key: 'WEBHOOK_BASE_URL',
          value: 'https://platform.io/',
          isSecret: false,
        },
      });
      const url = await svc.buildWebhookUrl('webhooks');
      expect(url).toBe('https://platform.io/webhooks');
    });

    it('throws NotFoundException when base URL is missing and throwIfMissing=true', async () => {
      const { svc } = makeSvc({ record: null, webhookUrl: '' });
      await expect(svc.buildWebhookUrl('/hook')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns empty string when base URL is missing and throwIfMissing=false', async () => {
      const { svc } = makeSvc({ record: null, webhookUrl: '' });
      const url = await svc.buildWebhookUrl('/hook', { throwIfMissing: false });
      expect(url).toBe('');
    });
  });

  describe('set', () => {
    it('upserts a plaintext config', async () => {
      const { svc, prisma } = makeSvc({ record: null });
      await svc.set('THEME', 'light');
      expect(prisma.platformConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'THEME' },
          create: expect.objectContaining({ key: 'THEME', value: 'light' }),
        }),
      );
    });

    it('encrypts value when isSecret=true', async () => {
      const { svc, crypto, prisma } = makeSvc({ record: null });
      await svc.set('API_KEY', 'secret123', true);
      expect(crypto.encrypt).toHaveBeenCalledWith('secret123');
      const upsertCall = (prisma.platformConfig.upsert as jest.Mock).mock
        .calls[0][0];
      expect(upsertCall.create.value).toBe('enc:secret123');
    });

    it('masks value "***" keeps existing value for secret config', async () => {
      const { svc, prisma } = makeSvc({
        record: { key: 'API_KEY', value: 'old-enc', isSecret: true },
      });
      await svc.set('API_KEY', '***');
      const upsertCall = (prisma.platformConfig.upsert as jest.Mock).mock
        .calls[0][0];
      // masked → keep existing encrypted value
      expect(upsertCall.update.value).toBe('old-enc');
    });
  });

  describe('getAll', () => {
    it('returns all configs with secrets masked', async () => {
      const { svc } = makeSvc({
        allRecords: [
          { key: 'A', value: 'public', isSecret: false },
          { key: 'B', value: 'enc-value', isSecret: true },
        ],
      });
      const all = await svc.getAll();
      expect(all).toHaveLength(2);
      expect(all.find((c) => c.key === 'A')?.value).toBe('public');
      expect(all.find((c) => c.key === 'B')?.value).toBe('***');
    });
  });
});
