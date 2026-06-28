import { Role } from '@prisma/client';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { DatabaseBackupService } from './database-backup.service';
import { DatabaseBackupsController } from './database-backups.controller';

describe('DatabaseBackupsController', () => {
  const user = { id: 'user-1', role: Role.ADMIN } as JwtPayload;

  function build() {
    const backups = {
      listBackups: jest.fn().mockResolvedValue([]),
      createBackup: jest.fn().mockResolvedValue({ id: 'b1' }),
      restoreBackup: jest.fn().mockResolvedValue({ id: 'b1' }),
    } as unknown as DatabaseBackupService;
    const ctrl = new DatabaseBackupsController(backups);
    return { ctrl, backups };
  }

  it('list / create / restore delegate with the acting user', async () => {
    const { ctrl, backups } = build();
    await ctrl.list('se1', user);
    await ctrl.create('se1', user);
    await ctrl.restore('b1', user);
    expect(backups.listBackups).toHaveBeenCalledWith(
      'se1',
      'user-1',
      Role.ADMIN,
    );
    expect(backups.createBackup).toHaveBeenCalledWith(
      'se1',
      'user-1',
      Role.ADMIN,
    );
    expect(backups.restoreBackup).toHaveBeenCalledWith(
      'b1',
      'user-1',
      Role.ADMIN,
    );
  });
});
