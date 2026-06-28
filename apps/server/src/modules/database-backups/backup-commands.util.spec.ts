import { ManagedServiceType } from '@prisma/client';
import { dumpSpec, restoreSpec } from './backup-commands.util';

describe('backup-commands.util', () => {
  it('builds engine-specific dump commands (PG/MySQL/Mongo) with the right extension', () => {
    expect(dumpSpec(ManagedServiceType.POSTGRES)).toMatchObject({ ext: 'sql' });
    expect(dumpSpec(ManagedServiceType.POSTGRES)?.cmd.join(' ')).toContain(
      'pg_dump',
    );
    expect(dumpSpec(ManagedServiceType.MYSQL)?.cmd.join(' ')).toContain(
      'mysqldump',
    );
    expect(dumpSpec(ManagedServiceType.MONGODB)).toMatchObject({
      ext: 'archive',
    });
    expect(dumpSpec(ManagedServiceType.MONGODB)?.cmd.join(' ')).toContain(
      'mongodump',
    );
  });

  it('mirrors restore commands for each engine', () => {
    expect(restoreSpec(ManagedServiceType.POSTGRES)?.cmd.join(' ')).toContain(
      'psql',
    );
    expect(restoreSpec(ManagedServiceType.MYSQL)?.cmd.join(' ')).toContain(
      'mysql',
    );
    expect(restoreSpec(ManagedServiceType.MONGODB)?.cmd.join(' ')).toContain(
      'mongorestore --archive --drop',
    );
  });

  it('returns null for engines without a portable logical dump (Redis/RabbitMQ)', () => {
    expect(dumpSpec(ManagedServiceType.REDIS)).toBeNull();
    expect(restoreSpec(ManagedServiceType.REDIS)).toBeNull();
  });
});
