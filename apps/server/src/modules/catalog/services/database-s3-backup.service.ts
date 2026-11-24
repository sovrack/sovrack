import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ManagedServiceType } from '@prisma/client';
import { createHmac, createHash } from 'crypto';
import type { DbCredentials } from '../../../shared/utils/database-spec.util';

export type S3StorageConfig = {
  endpoint: string; // e.g., 'https://s3.eu-west-1.amazonaws.com' or 'https://<account>.r2.cloudflarestorage.com'
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type BackupMetadata = {
  backupId: string;
  serviceId: string;
  databaseType: ManagedServiceType;
  fileName: string;
  createdAt: string;
  sizeBytes?: number;
};

/**
 * DatabaseS3BackupService
 *
 * Implements S3 / Cloudflare R2 / MinIO automated backup streaming & 1-click restore commands.
 * Uses native Node.js crypto AWS SigV4 for zero-dependency high-performance cloud storage integration.
 */
@Injectable()
export class DatabaseS3BackupService {
  private readonly logger = new Logger(DatabaseS3BackupService.name);

  /**
   * Generates the shell command to execute inside or against the Docker host
   * to produce a compressed .sql.gz or archive stream.
   */
  generateDumpCommand(
    databaseType: ManagedServiceType,
    containerName: string,
    creds: DbCredentials,
  ): string {
    switch (databaseType) {
      case ManagedServiceType.POSTGRES: {
        const user = creds.user ?? 'postgres';
        const dbName = creds.dbName ?? 'postgres';
        return `docker exec ${containerName} pg_dump -U ${user} -d ${dbName} | gzip -c`;
      }
      case ManagedServiceType.MYSQL: {
        const user = creds.user ?? 'root';
        const escapedPwd = creds.password
          ? creds.password.replace(/'/g, "'\\''")
          : '';
        const pwd = creds.password ? `-p'${escapedPwd}'` : '';
        const dbName = creds.dbName ?? '';
        return `docker exec ${containerName} mysqldump -u ${user} ${pwd} ${dbName} | gzip -c`;
      }
      case ManagedServiceType.MONGODB: {
        return `docker exec ${containerName} mongodump --archive --gzip`;
      }
      case ManagedServiceType.REDIS: {
        return `docker exec ${containerName} redis-cli bgsave && sleep 2 && docker exec ${containerName} cat /data/dump.rdb | gzip -c`;
      }
      case ManagedServiceType.RABBITMQ: {
        return `docker exec ${containerName} rabbitmq-diagnostics export_definitions /tmp/defs.json && docker exec ${containerName} cat /tmp/defs.json | gzip -c`;
      }
      default:
        throw new BadRequestException(
          `Type de base non supporté : ${String(databaseType)}`,
        );
    }
  }

  /**
   * Generates the shell command to restore an archive into the target container.
   */
  generateRestoreCommand(
    databaseType: ManagedServiceType,
    containerName: string,
    creds: DbCredentials,
    localArchiveFilePath: string,
  ): string {
    switch (databaseType) {
      case ManagedServiceType.POSTGRES: {
        const user = creds.user ?? 'postgres';
        const dbName = creds.dbName ?? 'postgres';
        return `gunzip -c ${localArchiveFilePath} | docker exec -i ${containerName} psql -U ${user} -d ${dbName}`;
      }
      case ManagedServiceType.MYSQL: {
        const user = creds.user ?? 'root';
        const escapedPwd = creds.password
          ? creds.password.replace(/'/g, "'\\''")
          : '';
        const pwd = creds.password ? `-p'${escapedPwd}'` : '';
        const dbName = creds.dbName ?? '';
        return `gunzip -c ${localArchiveFilePath} | docker exec -i ${containerName} mysql -u ${user} ${pwd} ${dbName}`;
      }
      case ManagedServiceType.MONGODB: {
        return `docker exec -i ${containerName} mongorestore --archive --gzip < ${localArchiveFilePath}`;
      }
      case ManagedServiceType.REDIS: {
        return `gunzip -c ${localArchiveFilePath} | docker exec -i ${containerName} sh -c 'cat > /data/dump.rdb'`;
      }
      default:
        throw new BadRequestException(
          `Restauration non supportée pour : ${String(databaseType)}`,
        );
    }
  }

  /**
   * Génère les paramètres de configuration PostgreSQL pour le streaming WAL continu vers S3 / R2 (PITR).
   */
  generatePostgresWalArchiveConfig(
    bucketName: string,
    prefix: string = 'wal-archives',
  ): { archiveMode: string; archiveCommand: string; walLevel: string } {
    return {
      walLevel: 'replica',
      archiveMode: 'on',
      archiveCommand: `gzip -c %p | aws s3 cp - s3://${bucketName}/${prefix}/%f.gz`,
    };
  }

  /**
   * Génère la commande de restauration Point-In-Time (PITR) pour PostgreSQL à la seconde exacte demandée.
   */
  generatePostgresPitrRestoreCommand(
    containerName: string,
    targetTimestamp: string,
    bucketName: string,
    prefix: string = 'wal-archives',
  ): string {
    const recoveryConfig = [
      `restore_command = 'aws s3 cp s3://${bucketName}/${prefix}/%f.gz - | gunzip -c > %p'`,
      `recovery_target_time = '${targetTimestamp}'`,
      `recovery_target_action = 'promote'`,
    ].join('\\n');

    return `docker exec ${containerName} sh -c "echo \\"${recoveryConfig}\\" >> /var/lib/postgresql/data/postgresql.auto.conf && touch /var/lib/postgresql/data/recovery.signal" && docker restart ${containerName}`;
  }

  /**
   * Signs an AWS S3 / Cloudflare R2 REST PUT request using AWS Signature Version 4.
   */
  generateS3UploadHeaders(
    config: S3StorageConfig,
    objectKey: string,
    payloadSha256: string = 'UNSIGNED-PAYLOAD',
  ): { url: string; headers: Record<string, string> } {
    const region = config.region || 'us-east-1';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const cleanEndpoint = config.endpoint.replace(/\/+$/, '');
    const url = `${cleanEndpoint}/${config.bucket}/${objectKey}`;
    const host = new URL(cleanEndpoint).host;

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadSha256}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      'PUT',
      `/${config.bucket}/${objectKey}`,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadSha256,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = this.getSignatureKey(
      config.secretAccessKey,
      dateStamp,
      region,
      's3',
    );
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex');

    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      url,
      headers: {
        Host: host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadSha256,
        Authorization: authorizationHeader,
      },
    };
  }

  private getSignatureKey(
    key: string,
    dateStamp: string,
    regionName: string,
    serviceName: string,
  ): Buffer {
    const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(regionName).digest();
    const kService = createHmac('sha256', kRegion).update(serviceName).digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }
}
