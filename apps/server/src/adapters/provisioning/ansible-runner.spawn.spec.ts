import { ConfigService } from '@nestjs/config';
import { AnsibleRunnerService } from './ansible-runner.service';
import type { AnsibleRunOptions } from './ports/ansible-runner.port';

// Module-level mock de child_process.spawn — isolé dans ce spec pour ne pas
// interférer avec ansible-runner.service.spec.ts (jest.mock est par fichier).
const spawnMock = jest.fn();
type ProcHandlers = Record<string, (...args: unknown[]) => void>;
const procHandlers: ProcHandlers = {};

jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => {
    spawnMock(...args);
    const proc = {
      stdout: {
        on: (_ev: string, cb: (chunk: Buffer) => void) => {
          procHandlers['stdout'] = cb;
        },
      },
      stderr: {
        on: (_ev: string, cb: (chunk: Buffer) => void) => {
          procHandlers['stderr'] = cb;
        },
      },
      on: (ev: string, cb: (...a: unknown[]) => void) => {
        procHandlers[ev] = cb;
      },
      kill: jest.fn(),
    } as unknown as ReturnType<typeof import('child_process').spawn>;
    return proc;
  },
}));

const options = (over: Partial<AnsibleRunOptions> = {}): AnsibleRunOptions => ({
  signal: {
    aborted: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  timeoutMs: 60_000,
  ...over,
});

const service = (values: Record<string, string> = {}) =>
  new AnsibleRunnerService({
    get: (k: string, d?: string) => values[k] ?? d,
  } as unknown as ConfigService);

const feed = (ev: 'stdout' | 'stderr', text: string) =>
  procHandlers[ev]?.(Buffer.from(text));

describe('AnsibleRunnerService.runPlaybook (spawn)', () => {
  beforeEach(() => {
    spawnMock.mockClear();
    for (const k of Object.keys(procHandlers)) delete procHandlers[k];
  });

  it('resolves with the redacted output on exit code 0', async () => {
    const p = service().runPlaybook(['playbook.yml'], {}, options(), {
      onLog: jest.fn(),
    });
    feed('stdout', 'ok: [target]');
    feed('stderr', 'warning line');
    procHandlers['close']?.(0);
    await expect(p).resolves.toContain('ok: [target]');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('throws a FR BadRequest on non-zero exit', async () => {
    const p = service().runPlaybook(['pb.yml'], {}, options());
    feed('stderr', 'fatal: [x]: FAILED! => {"msg": "boom", "cmd": "ls"}');
    procHandlers['close']?.(2);
    await expect(p).rejects.toThrow(/boom|FAILED/);
  });

  it('throws InternalServerError when spawn emits an error', async () => {
    const p = service().runPlaybook(['pb.yml'], {}, options());
    procHandlers['error']?.(new Error('EACCES'));
    await expect(p).rejects.toThrow(/Cannot launch ansible-playbook/);
  });

  it('aborts and throws JOB_TIMEOUT when the signal fires', async () => {
    // Capture l'écouteur 'abort' ajouté par le service.
    let abortListener: (() => void) | undefined;
    const signal = {
      aborted: false,
      addEventListener: (_e: string, cb: () => void) => {
        abortListener = cb;
      },
      removeEventListener: jest.fn(),
    };
    const p = service().runPlaybook(
      ['pb.yml'],
      {},
      { signal, timeoutMs: 60_000 },
    );
    expect(abortListener).toBeDefined();
    abortListener!();
    await expect(p).rejects.toThrow(/JOB_TIMEOUT/);
  });

  it('calls back onLog with redacted messages', async () => {
    const onLog = jest.fn();
    const p = service().runPlaybook(['pb.yml'], {}, options(), {
      onLog,
    });
    feed('stdout', 'line1\nline2');
    procHandlers['close']?.(0);
    await p;
    expect(onLog.mock.calls.length).toBeGreaterThan(0);
    const first = onLog.mock.calls[0][0];
    expect(first.message).toBe('line1');
  });
});
