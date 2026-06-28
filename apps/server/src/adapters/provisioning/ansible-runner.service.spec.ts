import { ConfigService } from '@nestjs/config';
import { AnsibleRunnerService } from './ansible-runner.service';

function build(values: Record<string, string> = {}): AnsibleRunnerService {
  const config = {
    get: (key: string, def?: string) => values[key] ?? def,
  } as unknown as ConfigService;
  return new AnsibleRunnerService(config);
}

const baseInput = {
  serverId: 'srv-12345678-abcd',
  host: '10.0.0.1',
  port: 22,
  username: 'deploy',
};

describe('AnsibleRunnerService.generateInventory', () => {
  it('builds a [targets] inventory with host/port/user', () => {
    const inv = build().generateInventory(baseInput);
    expect(inv).toContain('[targets]');
    expect(inv).toContain('ansible_host=10.0.0.1');
    expect(inv).toContain('ansible_port=22');
    expect(inv).toContain('ansible_user=deploy');
    // Host alias uses the first 8 chars of the server id.
    expect(inv).toContain('server_srv-1234');
  });

  it('defaults StrictHostKeyChecking to yes', () => {
    expect(build().generateInventory(baseInput)).toContain(
      'StrictHostKeyChecking=yes',
    );
  });

  it('honours an explicit host-key-checking mode + knownHostsPath', () => {
    const inv = build().generateInventory({
      ...baseInput,
      strictHostKeyChecking: 'accept-new',
      knownHostsPath: '/tmp/known_hosts',
    });
    expect(inv).toContain('StrictHostKeyChecking=accept-new');
    expect(inv).toContain('UserKnownHostsFile=/tmp/known_hosts');
  });

  it('clamps the port into the valid 1..65535 range', () => {
    expect(build().generateInventory({ ...baseInput, port: 0 })).toContain(
      'ansible_port=1',
    );
    expect(build().generateInventory({ ...baseInput, port: 999999 })).toContain(
      'ansible_port=65535',
    );
  });

  it('SECURITY: strips shell metacharacters from host/username (no injection)', () => {
    const inv = build().generateInventory({
      ...baseInput,
      host: '10.0.0.1"; rm -rf / #',
      username: 'root$(whoami)`id`;|&',
    });
    // None of the chaining/quoting metacharacters survive (single quote is
    // excluded: it legitimately wraps ansible_ssh_common_args='...').
    for (const ch of ['"', '\\', ';', '|', '&', '$', '`']) {
      expect(inv.includes(`${ch}`)).toBe(false);
    }
  });
});

describe('AnsibleRunnerService path resolution', () => {
  it('resolvePlaybooksRoot uses ANSIBLE_PLAYBOOKS_PATH when set', () => {
    const root = build({
      ANSIBLE_PLAYBOOKS_PATH: '/custom/pb',
    }).resolvePlaybooksRoot();
    expect(root).toBe('/custom/pb');
  });

  it('resolvePlaybooksRoot falls back to <cwd>/ansible/playbooks', () => {
    expect(build().resolvePlaybooksRoot()).toMatch(/ansible\/playbooks$/);
  });

  it('resolvePlaybookBin falls back to the global binary without a venv', () => {
    expect(build().resolvePlaybookBin()).toBe('ansible-playbook');
  });
});
