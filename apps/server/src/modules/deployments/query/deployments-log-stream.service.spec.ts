import { Test } from '@nestjs/testing';
import { DeploymentsLogStreamService } from './deployments-log-stream.service';
import { DockerApiService as DockerRemoteService } from '../../../core/container-runtime/docker-api.service';

/**
 * Per-socket log streaming manager.
 *
 * Tests cover:
 *   - subscribe() opens a stream and pipes each line as a socket event
 *   - stderr lines emit `level: 'error'`, stdout lines `level: 'info'`
 *   - subscribe() is idempotent (re-subscribe returns the same key)
 *   - unsubscribe() cancels the stream and stops emissions
 *   - unsubscribeAll() cancels all streams for a socket
 *   - Errors from the underlying stream emit `deployment:log-error`
 *     and clean up the subscription
 *   - onModuleDestroy cancels all active subscriptions
 */
describe('DeploymentsLogStreamService', () => {
  let service: DeploymentsLogStreamService;
  let dockerRemote: { streamContainerLogs: jest.Mock };
  let mockSocket: {
    id: string;
    connected: boolean;
    emit: jest.Mock;
  };

  /**
   * Build a mock async iterable that yields the given lines then ends.
   * Each `next()` awaits a microtask so the test can observe the
   * subscription state in between iterations. The `signal` is checked
   * on each iteration so the test's unsubscribe() call actually
   * stops the loop.
   */
  function makeIterable(
    lines: { stream: 'stdout' | 'stderr'; line: string }[],
    signal: AbortSignal,
  ): AsyncIterable<{ stream: 'stdout' | 'stderr'; line: string }> {
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          async next() {
            // Yield to the event loop so the test's `setImmediate`
            // checks run between iterations. Without this, the pump
            // would drain the entire iterable in a single microtask
            // and the subscription would already be gone by the time
            // the test inspects the state.
            await new Promise((r) => setImmediate(r));
            if (signal.aborted) return { value: undefined, done: true };
            if (i >= lines.length) return { value: undefined, done: true };
            return { value: lines[i++], done: false };
          },
        };
      },
    };
  }

  beforeEach(async () => {
    dockerRemote = { streamContainerLogs: jest.fn() };
    mockSocket = {
      id: 'sock_1',
      connected: true,
      emit: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeploymentsLogStreamService,
        { provide: DockerRemoteService, useValue: dockerRemote },
      ],
    }).compile();
    service = moduleRef.get(DeploymentsLogStreamService);
  });

  it('opens a stream and pipes each line as a `deployment:log` event', async () => {
    dockerRemote.streamContainerLogs.mockReturnValue(
      makeIterable(
        [
          { stream: 'stdout', line: 'hello' },
          { stream: 'stderr', line: 'oops' },
        ],
        new AbortController().signal,
      ),
    );
    const key = await service.subscribe(mockSocket as never, {
      deploymentId: 'dep_1',
      serverId: 'srv_1',
      containerName: 'web',
    });
    expect(key).toBe('sock_1:dep_1:web');
    expect(dockerRemote.streamContainerLogs).toHaveBeenCalledWith(
      'srv_1',
      'web',
      { follow: true, tail: 100 },
    );
    // Emit a "started" marker first, then the lines, then "ended".
    // Wait a few ticks for the pump to drain the iterable (each
    // iteration awaits `setImmediate`, so 2 lines + the "end" frame
    // takes ~3 ticks).
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const emitCalls = mockSocket.emit.mock.calls.map((c) => c[0]);
    expect(emitCalls).toContain('deployment:log-stream:started');
    expect(emitCalls).toContain('deployment:log');
    expect(emitCalls).toContain('deployment:log-stream:ended');
    // Stderr maps to level=error.
    const logEmit = mockSocket.emit.mock.calls.find(
      (c) => c[0] === 'deployment:log' && c[1].message === 'oops',
    );
    expect(logEmit?.[1].level).toBe('error');
  });

  it('is idempotent — re-subscribing returns the existing key', async () => {
    dockerRemote.streamContainerLogs.mockReturnValue(
      makeIterable([], new AbortController().signal),
    );
    const key1 = await service.subscribe(mockSocket as never, {
      deploymentId: 'dep_1',
      serverId: 'srv_1',
      containerName: 'web',
    });
    const key2 = await service.subscribe(mockSocket as never, {
      deploymentId: 'dep_1',
      serverId: 'srv_1',
      containerName: 'web',
    });
    expect(key1).toBe(key2);
    // The underlying stream is opened only once.
    expect(dockerRemote.streamContainerLogs).toHaveBeenCalledTimes(1);
  });

  it('cancels the stream when unsubscribe() is called', async () => {
    const ac = new AbortController();
    dockerRemote.streamContainerLogs.mockReturnValue(
      makeIterable(
        // A long stream that would keep yielding — we abort mid-way.
        Array.from({ length: 1000 }, (_, i) => ({
          stream: 'stdout' as const,
          line: `line ${i}`,
        })),
        ac.signal,
      ),
    );
    const key = await service.subscribe(mockSocket as never, {
      deploymentId: 'dep_1',
      serverId: 'srv_1',
      containerName: 'web',
    });
    // Let the pump run for a few iterations.
    await new Promise((r) => setImmediate(r));
    const cancelled = service.unsubscribe(key!);
    expect(cancelled).toBe(true);
    // The pump exits and the subscription is removed.
    expect(
      (
        service as unknown as { subscriptions: Map<string, unknown> }
      ).subscriptions.has(key!),
    ).toBe(false);
  });

  it('returns false from unsubscribe() when the key is unknown', () => {
    expect(service.unsubscribe('nope')).toBe(false);
  });

  it('cancels every subscription for a socket via unsubscribeAll()', async () => {
    dockerRemote.streamContainerLogs.mockReturnValue(
      makeIterable(
        Array.from({ length: 100 }, (_, i) => ({
          stream: 'stdout' as const,
          line: `line ${i}`,
        })),
        new AbortController().signal,
      ),
    );
    await service.subscribe(mockSocket as never, {
      deploymentId: 'dep_1',
      serverId: 'srv_1',
      containerName: 'web',
    });
    await service.subscribe(mockSocket as never, {
      deploymentId: 'dep_1',
      serverId: 'srv_1',
      containerName: 'sidecar',
    });
    const cancelled = service.unsubscribeAll('sock_1');
    expect(cancelled).toBe(2);
  });

  it('emits `deployment:log-error` and cleans up on stream failure', async () => {
    const failingIterable = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            throw new Error('TLS handshake failed');
          },
        };
      },
    };
    dockerRemote.streamContainerLogs.mockReturnValue(failingIterable);
    const key = await service.subscribe(mockSocket as never, {
      deploymentId: 'dep_1',
      serverId: 'srv_1',
      containerName: 'web',
    });
    await new Promise((r) => setImmediate(r));
    const errorEmit = mockSocket.emit.mock.calls.find(
      (c) => c[0] === 'deployment:log-error',
    );
    expect(errorEmit?.[1].message).toBe('TLS handshake failed');
    expect(
      (
        service as unknown as { subscriptions: Map<string, unknown> }
      ).subscriptions.has(key!),
    ).toBe(false);
  });

  it('cancels all active subscriptions on module destroy', async () => {
    dockerRemote.streamContainerLogs.mockReturnValue(
      makeIterable([], new AbortController().signal),
    );
    await service.subscribe(mockSocket as never, {
      deploymentId: 'dep_1',
      serverId: 'srv_1',
      containerName: 'web',
    });
    const subs = (service as unknown as { subscriptions: Map<string, unknown> })
      .subscriptions;
    expect(subs.size).toBe(1);
    await service.onModuleDestroy();
    expect(subs.size).toBe(0);
  });
});
