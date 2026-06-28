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

  it('monte les secrets de build via BuildKit --secret (jamais en --build-arg)', async () => {
    const { svc, ssh } = make();
    await svc.run({ ...params(), buildSecrets: ['DB_PASSWORD=s3cr3t'] });
    const cmds = ssh.execOrThrow.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    const build = cmds.find((c) => c.includes('docker build'));
    expect(build).toContain('--secret id=DB_PASSWORD,src=');
    // Le secret ne doit JAMAIS partir en build-arg (sinon fuite dans l'image).
    expect(build).not.toContain('--build-arg DB_PASSWORD');
    expect(build).not.toContain('s3cr3t');
    // Le fichier secret est écrit hors du contexte de build.
    expect(cmds.some((c) => c.includes("printf '%s' 's3cr3t'"))).toBe(true);
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

  it('Dockerfile build active BuildKit + layer cache (parité Coolify/Dokploy)', async () => {
    const { svc, ssh } = make();
    await svc.run(params());
    const cmds = ssh.execOrThrow.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    const build = cmds.find((c) => c.includes('docker build'));
    expect(build).toContain('DOCKER_BUILDKIT=1');
    expect(build).toContain('--cache-from');
    expect(build).toContain('BUILDKIT_INLINE_CACHE=1');
  });

  it('Static build active aussi BuildKit + cache', async () => {
    const { svc, ssh } = make();
    await svc.run(params({ buildPack: 'STATIC' }));
    const cmds = ssh.execOrThrow.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    const build = cmds.find((c) => c.includes('docker build'));
    expect(build).toContain('DOCKER_BUILDKIT=1');
    expect(build).toContain('--cache-from');
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

  it('clone avec submodules + timeout (robustesse)', async () => {
    const { svc, ssh } = make();
    await svc.run(params());
    const cmds = ssh.execOrThrow.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    const clone = cmds.find((c) => c.includes('git clone'));
    expect(clone).toContain('--recurse-submodules');
    expect(clone).toContain('timeout ');
  });

  it('borne le docker build par un timeout', async () => {
    const { svc, ssh } = make();
    await svc.run(params());
    const cmds = ssh.execOrThrow.mock.calls.map(
      (c: unknown[]) => c[1] as string,
    );
    const build = cmds.find((c) => c.includes('docker build'));
    expect(build).toMatch(/timeout \d+ docker build/);
  });

  it('écrit un .dockerignore par défaut (anti-fuite .env / contexte léger)', async () => {
    const { svc, ssh } = make();
    await svc.run(params());
    const all = [...ssh.execOrThrow.mock.calls, ...ssh.exec.mock.calls].map(
      (c: unknown[]) => c[1] as string,
    );
    const di = all.find((c) => c.includes('.dockerignore'));
    expect(di).toContain('[ -f .dockerignore ]');
    expect(di).toContain('.env');
  });

  it('prune les images dangling après un build réussi (hygiène disque)', async () => {
    const { svc, ssh } = make();
    await svc.run(params());
    const execCmds = ssh.exec.mock.calls.map((c: unknown[]) => c[1] as string);
    expect(execCmds.some((c) => c.includes('docker image prune -f'))).toBe(
      true,
    );
  });
});
