import { BadRequestException } from '@nestjs/common';
import { LocalBuildService, LocalBuildParams } from './local-build.service';

describe('LocalBuildService', () => {
  function make() {
    const conn = { dispose: jest.fn().mockResolvedValue(undefined) };
    const ssh = {
      connect: jest.fn().mockResolvedValue(conn),
      execOrThrow: jest.fn().mockResolvedValue(undefined),
      exec: jest.fn().mockResolvedValue(undefined),
    };
    const crypto = { decrypt: (v: string) => v };
    const serversCrypto = { decrypt: (v: string) => v };
    const serverHostKeys = {
      resolveForConnection: jest.fn().mockResolvedValue({ keyBase64: 'k' }),
    };
    const svc = new LocalBuildService(
      ssh as never,
      crypto as never,
      serversCrypto as never,
      serverHostKeys as never,
    );
    return { svc, ssh };
  }

  const params = (
    over: Partial<LocalBuildParams['deployment']['service']> = {},
  ): LocalBuildParams => ({
    deployment: {
      id: 'deadbeef-1234',
      branch: 'main',
      service: {
        repoPath: 'grp/app',
        buildPack: 'DOCKERFILE',
        provider: { providerUrl: 'https://gitlab.com', adminToken: 'tok' },
        ...over,
      },
    },
    imageTag: 'proj:main',
    server: { host: 'h', port: 22, username: 'u', sshKey: 'key' },
    buildArgs: ['NEXT_PUBLIC_API_URL=https://api'],
    onLog: jest.fn(),
  });

  it('clone puis docker build (Dockerfile) avec build-args', async () => {
    const { svc, ssh } = make();
    await svc.run(params());
    const cmds = ssh.execOrThrow.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    expect(cmds.some((c) => c.includes('git clone'))).toBe(true);
    expect(
      cmds.some((c) => c.includes('docker build') && c.includes('--build-arg')),
    ).toBe(true);
  });

  it('Nixpacks → nixpacks build avec --env', async () => {
    const { svc, ssh } = make();
    await svc.run(params({ buildPack: 'NIXPACKS' }));
    const cmds = ssh.execOrThrow.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    expect(
      cmds.some((c) => c.includes('nixpacks build') && c.includes('--env')),
    ).toBe(true);
  });

  it('rejette si repoPath manquant', async () => {
    const { svc } = make();
    await expect(svc.run(params({ repoPath: null }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejette un repoPath non namespacé', async () => {
    const { svc } = make();
    await expect(
      svc.run(params({ repoPath: 'noslash' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('nettoie le workspace (rm -rf) à la fin', async () => {
    const { svc, ssh } = make();
    await svc.run(params());
    expect(ssh.exec).toHaveBeenCalled();
  });
});
