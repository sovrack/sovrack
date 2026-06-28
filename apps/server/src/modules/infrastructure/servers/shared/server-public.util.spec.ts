import { Server, ServerConnectionMode } from '@prisma/client';
import { ServerConnectionModeDto } from '../dto/create-server.dto';
import { toPublicServer, toConnectionModeDto } from './server-public.util';

const baseServer = (): Server =>
  ({
    id: 'srv-1',
    name: 'vps-1',
    host: '10.0.0.1',
    connectionMode: ServerConnectionMode.SSH,
    sshKey: 'PRIVATE-SSH-KEY-MATERIAL',
    capabilities: {
      'docker.installed': 'true',
      'gitlab_runner.installed': 'false',
    },
  }) as unknown as Server;

describe('toConnectionModeDto', () => {
  it('maps SSH to the SSH DTO mode', () => {
    expect(toConnectionModeDto(ServerConnectionMode.SSH)).toBe(
      ServerConnectionModeDto.SSH,
    );
  });
});

describe('toPublicServer', () => {
  it('never exposes the private sshKey', () => {
    const result = toPublicServer(baseServer());
    expect('sshKey' in result).toBe(false);
  });

  it('derives the capability flags from the capabilities map', () => {
    const result = toPublicServer(baseServer());
    expect(result.hasDocker).toBe(true);
    expect(result.hasRunner).toBe(false);
    expect(result.connectionMode).toBe(ServerConnectionModeDto.SSH);
  });

  it('passes the active job through (defaulting to null)', () => {
    expect(toPublicServer(baseServer()).activeJob).toBeNull();
    const job = { id: 'job-1' } as never;
    expect(toPublicServer(baseServer(), job).activeJob).toBe(job);
  });
});
