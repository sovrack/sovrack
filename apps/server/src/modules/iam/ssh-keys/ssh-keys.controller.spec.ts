import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { SshKeysService } from './ssh-keys.service';
import { SshKeysController } from './ssh-keys.controller';

describe('SshKeysController', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;

  function build() {
    const sshKeysService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'k1' }),
      remove: jest.fn().mockResolvedValue({ id: 'k1' }),
    } as unknown as SshKeysService;
    const ctrl = new SshKeysController(sshKeysService);
    return { ctrl, sshKeysService };
  }

  it('findAll / create / remove delegate scoped to the user', async () => {
    const { ctrl, sshKeysService } = build();
    await ctrl.findAll(user);
    await ctrl.create(user, { name: 'k', publicKey: 'ssh-rsa' } as never);
    await ctrl.remove(user, 'k1');
    expect(sshKeysService.findAll).toHaveBeenCalledWith('user-1');
    expect(sshKeysService.create).toHaveBeenCalledWith('user-1', {
      name: 'k',
      publicKey: 'ssh-rsa',
    });
    expect(sshKeysService.remove).toHaveBeenCalledWith('k1', 'user-1');
  });
});
