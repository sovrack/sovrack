import { promises as fs } from 'fs';
import { BackupStorageProvider } from '@prisma/client';
import { BackupStorageService } from './backup-storage.service';
import { PlatformService } from '../platform/platform.service';

describe('BackupStorageService', () => {
  function make(config: Record<string, string | null>) {
    const platform = {
      get: jest.fn((key: string) => Promise.resolve(config[key] ?? null)),
    };
    const service = new BackupStorageService(
      platform as unknown as PlatformService,
    );
    return { service, platform };
  }

  afterEach(() => jest.restoreAllMocks());

  describe('getActiveProvider', () => {
    it('defaults to LOCAL when unset', async () => {
      const { service } = make({});
      expect(await service.getActiveProvider()).toBe(
        BackupStorageProvider.LOCAL,
      );
    });

    it('returns S3 when configured (case-insensitive)', async () => {
      const { service } = make({ BACKUP_STORAGE_PROVIDER: 's3' });
      expect(await service.getActiveProvider()).toBe(BackupStorageProvider.S3);
    });
  });

  describe('upload', () => {
    it('writes to the local filesystem when provider is LOCAL', async () => {
      const { service } = make({ BACKUP_STORAGE_PROVIDER: 'LOCAL' });
      const mkdir = jest
        .spyOn(fs, 'mkdir')
        .mockResolvedValue(undefined as unknown as string);
      const write = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      const data = Buffer.from('-- dump');
      const result = await service.upload('env-1/bk-1.sql', data);

      expect(mkdir).toHaveBeenCalled();
      expect(write).toHaveBeenCalled();
      expect(result.provider).toBe(BackupStorageProvider.LOCAL);
      expect(result.sizeBytes).toBe(data.byteLength);
      expect(result.location).toContain('env-1/bk-1.sql');
    });

    it('throws a clear error when S3 is selected but misconfigured', async () => {
      const { service } = make({ BACKUP_STORAGE_PROVIDER: 'S3' });
      await expect(
        service.upload('env-1/bk-1.sql', Buffer.from('x')),
      ).rejects.toThrow(/S3 config is incomplete/);
    });
  });
});
