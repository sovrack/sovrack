import type { Server } from '@prisma/client';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { ServerSetupAnsibleService } from './server-setup-ansible.service';
import type { ServersCryptoService } from '../../../../adapters/ssh/servers-crypto.service';
import type { ServerHostKeyService } from '../../../../adapters/ssh/server-host-key.service';
import type { ServersConnectionService } from '../../servers/services/servers-connection.service';
import type { AnsibleRunnerService } from '../../../../adapters/provisioning/ansible-runner.service';
import type { SetupRoleKey } from '../../servers/shared/server-setup-options';

jest.mock('fs/promises', () => ({
  mkdtemp: jest.fn(),
  readFile: jest.fn(),
  rm: jest.fn().mockResolvedValue(undefined),
}));

const mockedMkdtemp = mkdtemp as jest.Mock;
const mockedReadFile = readFile as jest.Mock;
const mockedRm = rm as jest.Mock;

// Mission docker_tls (T1): the fetch dir for the client PEMs is a per-run
// mkdtemp OUTSIDE the repo (never committable), passed to Ansible as an
// extra-var, read back in memory, and destroyed in a finally — even on failure.
describe('ServerSetupAnsibleService — docker_tls fetch dir', () => {
  function build() {
    const crypto = {
      decrypt: jest.fn().mockReturnValue('KEY'),
      normalizePrivateKeyFormat: jest.fn().mockReturnValue('KEY'),
    } as unknown as ServersCryptoService;
    const hostKeys = {
      resolveForConnection: jest.fn().mockResolvedValue({ keyBase64: 'hk' }),
      resolveStrictHostKeyChecking: jest.fn().mockReturnValue('yes'),
      resolveKnownHostsPath: jest.fn().mockReturnValue('/tmp/known_hosts'),
    } as unknown as ServerHostKeyService;
    const ssh = {
      assertPasswordlessSudo: jest.fn().mockResolvedValue(undefined),
    } as unknown as ServersConnectionService;
    const ansibleRunner = {
      resolvePlaybooksRoot: jest.fn().mockReturnValue('/app/ansible/playbooks'),
      run: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ServerSetupAnsibleService(
      crypto,
      hostKeys,
      ssh,
      ansibleRunner as unknown as AnsibleRunnerService,
    );
    return { service, ansibleRunner };
  }

  const server = {
    id: 'srv-1',
    host: '10.0.0.9',
    port: 22,
    username: 'ubuntu',
    sshKey: 'enc',
  } as Server;

  const options = { signal: new AbortController().signal, timeoutMs: 60_000 };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedMkdtemp.mockResolvedValue('/tmp/docker-tls-abc123');
    mockedRm.mockResolvedValue(undefined);
  });

  it('passes docker_tls_fetch_dir + SAN ip, reads the 3 PEMs and cleans up the dir', async () => {
    mockedReadFile
      .mockResolvedValueOnce('CA_PEM')
      .mockResolvedValueOnce('CERT_PEM')
      .mockResolvedValueOnce('KEY_PEM');
    const { service, ansibleRunner } = build();

    const result = await service.runSetup(
      server,
      {
        roles: ['docker', 'docker_tls'] as SetupRoleKey[],
        selectedOptions: { docker: true, dockerTls: true },
        gitlabRunnerExecutor: 'docker',
      },
      options,
    );

    const extraVars = (ansibleRunner.run.mock.calls[0] as unknown[])[0] as {
      extraVars: Record<string, unknown>;
    };
    expect(extraVars.extraVars.docker_tls_fetch_dir).toBe(
      '/tmp/docker-tls-abc123',
    );
    expect(extraVars.extraVars.docker_tls_san_ip).toBe('10.0.0.9');
    expect(result.dockerTls).toEqual({
      ca: 'CA_PEM',
      cert: 'CERT_PEM',
      key: 'KEY_PEM',
    });
    expect(mockedRm).toHaveBeenCalledWith('/tmp/docker-tls-abc123', {
      recursive: true,
      force: true,
    });
  });

  it('creates NO fetch dir and returns null material when docker_tls is not selected', async () => {
    const { service, ansibleRunner } = build();
    const result = await service.runSetup(
      server,
      {
        roles: ['docker'] as SetupRoleKey[],
        selectedOptions: { docker: true },
        gitlabRunnerExecutor: 'docker',
      },
      options,
    );
    expect(mockedMkdtemp).not.toHaveBeenCalled();
    const callArg = (ansibleRunner.run.mock.calls[0] as unknown[])[0] as {
      extraVars: Record<string, unknown>;
    };
    expect(callArg.extraVars.docker_tls_fetch_dir).toBeUndefined();
    expect(result.dockerTls).toBeNull();
  });

  it('still destroys the temp dir when the Ansible run fails', async () => {
    const { service, ansibleRunner } = build();
    ansibleRunner.run.mockRejectedValueOnce(new Error('ansible exploded'));
    await expect(
      service.runSetup(
        server,
        {
          roles: ['docker', 'docker_tls'] as SetupRoleKey[],
          selectedOptions: { docker: true, dockerTls: true },
          gitlabRunnerExecutor: 'docker',
        },
        options,
      ),
    ).rejects.toThrow('ansible exploded');
    expect(mockedRm).toHaveBeenCalledWith('/tmp/docker-tls-abc123', {
      recursive: true,
      force: true,
    });
  });

  it('returns null material (no throw) when the certs were not fetched', async () => {
    mockedReadFile.mockRejectedValue(new Error('ENOENT'));
    const { service } = build();
    const result = await service.runSetup(
      server,
      {
        roles: ['docker_tls'] as SetupRoleKey[],
        selectedOptions: { dockerTls: true },
        gitlabRunnerExecutor: 'docker',
      },
      options,
    );
    expect(result.dockerTls).toBeNull();
  });
});
