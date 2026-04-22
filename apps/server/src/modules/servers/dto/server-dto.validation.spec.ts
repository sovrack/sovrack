import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServerDto } from './create-server.dto';
import { UpdateServerDto } from './update-server.dto';

describe('Server DTO validation', () => {
  it('accepts create payload with connectionMode=ssh', async () => {
    const dto = plainToInstance(CreateServerDto, {
      name: 'SSH server',
      host: '192.168.1.10',
      connectionMode: 'ssh',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts create payload without explicit connectionMode (defaults to ssh)', async () => {
    const dto = plainToInstance(CreateServerDto, {
      name: 'My VPS',
      host: '10.0.0.1',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects invalid connectionMode value', async () => {
    const dto = plainToInstance(CreateServerDto, {
      name: 'Bad server',
      host: '10.0.0.1',
      connectionMode: 'bastion',
    });

    const errors = await validate(dto);
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

    expect(messages).toContain('connectionMode doit être "ssh"');
  });

  it('rejects invalid connectionMode agent value', async () => {
    const dto = plainToInstance(CreateServerDto, {
      name: 'Bad server',
      host: '10.0.0.1',
      connectionMode: 'agent',
    });

    const errors = await validate(dto);
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

    expect(messages).toContain('connectionMode doit être "ssh"');
  });

  it('accepts update payload with valid ssh fields', async () => {
    const dto = plainToInstance(UpdateServerDto, {
      name: 'Updated VPS',
      host: '192.168.1.20',
      port: 2222,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
