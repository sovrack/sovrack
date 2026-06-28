import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { BackupStorageProvider } from '@prisma/client';
import { PlatformService } from '../platform/platform.service';

export type StoredBackup = {
  provider: BackupStorageProvider;
  /** Local absolute path OR S3 object key. */
  location: string;
  sizeBytes: number;
};

// PlatformConfig keys driving backup storage. Secrets are stored encrypted.
const KEY_PROVIDER = 'BACKUP_STORAGE_PROVIDER'; // 'LOCAL' | 'S3'
const KEY_BUCKET = 'BACKUP_S3_BUCKET';
const KEY_REGION = 'BACKUP_S3_REGION';
const KEY_ENDPOINT = 'BACKUP_S3_ENDPOINT'; // for S3-compatible (MinIO, B2…)
const KEY_PREFIX = 'BACKUP_S3_PREFIX'; // optional key prefix
const KEY_ACCESS_KEY = 'BACKUP_S3_ACCESS_KEY_ID'; // secret
const KEY_SECRET_KEY = 'BACKUP_S3_SECRET_ACCESS_KEY'; // secret

type S3Settings = {
  bucket: string;
  region: string;
  endpoint?: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/**
 * Pluggable backup storage. LOCAL writes to the backend host filesystem
 * (default, legacy behavior). S3 pushes the dump to an external S3-compatible
 * bucket so backups survive the loss of the host (durability/parity with
 * Coolify/Railway). The active provider + S3 credentials live in PlatformConfig
 * (secrets encrypted), so it's reconfigurable at runtime with no redeploy.
 */
@Injectable()
export class BackupStorageService {
  private readonly logger = new Logger(BackupStorageService.name);
  private readonly localBackupDir =
    process.env.DATABASE_BACKUP_DIR ?? join(process.cwd(), 'backups');

  constructor(private readonly platform: PlatformService) {}

  /** The currently configured storage provider (defaults to LOCAL). */
  async getActiveProvider(): Promise<BackupStorageProvider> {
    const raw = (await this.platform.get(KEY_PROVIDER))?.trim().toUpperCase();
    return raw === 'S3'
      ? BackupStorageProvider.S3
      : BackupStorageProvider.LOCAL;
  }

  /** Store a dump under `key` (e.g. "<serviceEnvId>/<backupId>.sql"). */
  async upload(key: string, data: Buffer): Promise<StoredBackup> {
    const provider = await this.getActiveProvider();
    return provider === BackupStorageProvider.S3
      ? this.uploadS3(key, data)
      : this.uploadLocal(key, data);
  }

  /** Fetch a previously stored dump (for restore). */
  async download(
    provider: BackupStorageProvider,
    location: string,
  ): Promise<Buffer> {
    if (provider === BackupStorageProvider.S3) {
      const { client, settings } = await this.resolveS3();
      const res = await client.send(
        new GetObjectCommand({ Bucket: settings.bucket, Key: location }),
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) throw new Error(`Empty S3 object at ${location}`);
      return Buffer.from(bytes);
    }
    return fs.readFile(location);
  }

  /** Delete a stored dump (retention/cleanup). Best-effort. */
  async remove(
    provider: BackupStorageProvider,
    location: string,
  ): Promise<void> {
    try {
      if (provider === BackupStorageProvider.S3) {
        const { client, settings } = await this.resolveS3();
        await client.send(
          new DeleteObjectCommand({ Bucket: settings.bucket, Key: location }),
        );
      } else {
        await fs.unlink(location);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to delete backup (${provider}) at ${location}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // ─── LOCAL ─────────────────────────────────────────────────────────────────

  private async uploadLocal(key: string, data: Buffer): Promise<StoredBackup> {
    const path = join(this.localBackupDir, key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, data);
    return {
      provider: BackupStorageProvider.LOCAL,
      location: path,
      sizeBytes: data.byteLength,
    };
  }

  // ─── S3 ────────────────────────────────────────────────────────────────────

  private async uploadS3(key: string, data: Buffer): Promise<StoredBackup> {
    const { client, settings } = await this.resolveS3();
    const objectKey = settings.prefix
      ? `${settings.prefix.replace(/\/+$/, '')}/${key}`
      : key;
    await client.send(
      new PutObjectCommand({
        Bucket: settings.bucket,
        Key: objectKey,
        Body: data,
        ContentType: 'application/sql',
      }),
    );
    this.logger.log(
      `Backup uploaded to S3: s3://${settings.bucket}/${objectKey} (${data.byteLength} bytes)`,
    );
    return {
      provider: BackupStorageProvider.S3,
      location: objectKey,
      sizeBytes: data.byteLength,
    };
  }

  private async resolveS3(): Promise<{
    client: S3Client;
    settings: S3Settings;
  }> {
    const [bucket, region, endpoint, prefix, accessKeyId, secretAccessKey] =
      await Promise.all([
        this.platform.get(KEY_BUCKET),
        this.platform.get(KEY_REGION),
        this.platform.get(KEY_ENDPOINT),
        this.platform.get(KEY_PREFIX),
        this.platform.get(KEY_ACCESS_KEY),
        this.platform.get(KEY_SECRET_KEY),
      ]);

    if (!bucket?.trim() || !accessKeyId?.trim() || !secretAccessKey?.trim()) {
      throw new Error(
        'Backup storage is set to S3 but S3 config is incomplete ' +
          '(BACKUP_S3_BUCKET / BACKUP_S3_ACCESS_KEY_ID / BACKUP_S3_SECRET_ACCESS_KEY).',
      );
    }

    const settings: S3Settings = {
      bucket: bucket.trim(),
      region: region?.trim() || 'us-east-1',
      endpoint: endpoint?.trim() || undefined,
      prefix: prefix?.trim() || '',
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
    };

    const client = new S3Client({
      region: settings.region,
      ...(settings.endpoint
        ? { endpoint: settings.endpoint, forcePathStyle: true }
        : {}),
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
    });
    return { client, settings };
  }
}
