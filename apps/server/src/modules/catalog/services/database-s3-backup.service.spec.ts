import { ManagedServiceType } from '@prisma/client';
import { DatabaseS3BackupService } from './database-s3-backup.service';

describe('DatabaseS3BackupService', () => {
  let service: DatabaseS3BackupService;

  beforeEach(() => {
    service = new DatabaseS3BackupService();
  });

  describe('generateDumpCommand', () => {
    it('generates pg_dump pipe gzip for POSTGRES', () => {
      const cmd = service.generateDumpCommand(
        ManagedServiceType.POSTGRES,
        'prod-postgres-1',
        { user: 'myuser', dbName: 'mydb' },
      );
      expect(cmd).toBe(
        'docker exec prod-postgres-1 pg_dump -U myuser -d mydb | gzip -c',
      );
    });

    it('generates mysqldump pipe gzip for MYSQL', () => {
      const cmd = service.generateDumpCommand(
        ManagedServiceType.MYSQL,
        'prod-mysql-1',
        { user: 'root', password: 'secret', dbName: 'appdb' },
      );
      expect(cmd).toContain("mysqldump -u root -p'secret' appdb | gzip -c");
    });

    it('safely escapes single quotes in MySQL passwords', () => {
      const cmd = service.generateDumpCommand(
        ManagedServiceType.MYSQL,
        'prod-mysql-1',
        { user: 'root', password: "p'assword", dbName: 'appdb' },
      );
      expect(cmd).toContain("p'\\''assword");
    });

    it('generates mongodump for MONGODB', () => {
      const cmd = service.generateDumpCommand(
        ManagedServiceType.MONGODB,
        'prod-mongo-1',
        {},
      );
      expect(cmd).toBe('docker exec prod-mongo-1 mongodump --archive --gzip');
    });

    it('generates redis SAVE command for REDIS', () => {
      const cmd = service.generateDumpCommand(
        ManagedServiceType.REDIS,
        'prod-redis-1',
        {},
      );
      expect(cmd).toContain('redis-cli bgsave');
    });
  });

  describe('generateRestoreCommand', () => {
    it('generates gunzip pipe psql for POSTGRES', () => {
      const cmd = service.generateRestoreCommand(
        ManagedServiceType.POSTGRES,
        'prod-postgres-1',
        { user: 'myuser', dbName: 'mydb' },
        '/tmp/backup.sql.gz',
      );
      expect(cmd).toBe(
        'gunzip -c /tmp/backup.sql.gz | docker exec -i prod-postgres-1 psql -U myuser -d mydb',
      );
    });

    it('generates gunzip pipe mysql for MYSQL', () => {
      const cmd = service.generateRestoreCommand(
        ManagedServiceType.MYSQL,
        'prod-mysql-1',
        { user: 'root', password: 'pwd', dbName: 'appdb' },
        '/tmp/backup.sql.gz',
      );
      expect(cmd).toBe(
        "gunzip -c /tmp/backup.sql.gz | docker exec -i prod-mysql-1 mysql -u root -p'pwd' appdb",
      );
    });
  });

  describe('generateS3UploadHeaders', () => {
    it('signs S3 PUT request with AWS SigV4 authorization header', () => {
      const result = service.generateS3UploadHeaders(
        {
          endpoint: 'https://s3.eu-west-1.amazonaws.com',
          bucket: 'sovrack-backups',
          region: 'eu-west-1',
          accessKeyId: 'AKIAEXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        },
        'backup-2026-10-24.sql.gz',
      );

      expect(result.url).toBe(
        'https://s3.eu-west-1.amazonaws.com/sovrack-backups/backup-2026-10-24.sql.gz',
      );
      expect(result.headers.Host).toBe('s3.eu-west-1.amazonaws.com');
      expect(result.headers['x-amz-date']).toBeDefined();
      expect(result.headers.Authorization).toContain(
        'AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/',
      );
    });
  });

  describe('PostgreSQL PITR and WAL streaming', () => {
    it('generates wal archive parameters for continuous S3 streaming', () => {
      const cfg = service.generatePostgresWalArchiveConfig('my-backup-bucket');
      expect(cfg.archiveMode).toBe('on');
      expect(cfg.walLevel).toBe('replica');
      expect(cfg.archiveCommand).toContain('s3://my-backup-bucket/wal-archives/');
    });

    it('generates point-in-time recovery restore script to specific second', () => {
      const restore = service.generatePostgresPitrRestoreCommand(
        'pg-container',
        '2026-11-23 14:30:00 UTC',
        'my-backup-bucket',
      );
      expect(restore).toContain("recovery_target_time = '2026-11-23 14:30:00 UTC'");
      expect(restore).toContain('recovery.signal');
      expect(restore).toContain('docker restart pg-container');
    });
  });
});
