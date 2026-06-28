import {
  SshConnectParams,
  SshConnection,
  SshExecutorService,
} from './ssh-executor.service';
import { SshConnectionPoolService } from './ssh-connection-pool.service';

/**
 * SshConnectionPoolService.
 *
 * The pool reuses live SSH connections across short-lived operations on the
 * same target. We mock SshExecutorService.connect to hand out fake connections
 * whose `isConnected()` and `dispose()` we control — no real daemon involved.
 */
describe('SshConnectionPoolService', () => {
  let executor: { connect: jest.Mock };
  let pool: SshConnectionPoolService;
  let created: FakeConn[];

  type FakeConn = SshConnection & {
    client: { isConnected: jest.Mock };
    dispose: jest.Mock;
  };

  function makeConn(alive = true): FakeConn {
    const conn = {
      client: { isConnected: jest.fn().mockReturnValue(alive) },
      dispose: jest.fn().mockResolvedValue(undefined),
    } as unknown as FakeConn;
    return conn;
  }

  const params: SshConnectParams = {
    host: '10.0.0.1',
    port: 22,
    username: 'deploy',
    privateKey: 'KEY-A',
  };

  beforeEach(() => {
    created = [];
    executor = {
      connect: jest.fn().mockImplementation(() => {
        const c = makeConn();
        created.push(c);
        return Promise.resolve(c);
      }),
    };
    pool = new SshConnectionPoolService(
      executor as unknown as SshExecutorService,
    );
  });

  afterEach(async () => {
    await pool.onModuleDestroy();
  });

  it('opens a fresh connection when the pool is cold', async () => {
    const conn = await pool.acquire(params);
    expect(executor.connect).toHaveBeenCalledTimes(1);
    expect(conn.client).toBe(created[0].client);
  });

  it('reuses a live connection after dispose() (no second handshake)', async () => {
    const first = await pool.acquire(params);
    await first.dispose(); // returns to the pool, does NOT close
    expect(created[0].dispose).not.toHaveBeenCalled();

    const second = await pool.acquire(params);
    expect(executor.connect).toHaveBeenCalledTimes(1); // reused
    expect(second.client).toBe(created[0].client);
  });

  it('does NOT reuse a dead connection — it opens a fresh one', async () => {
    const first = await pool.acquire(params);
    await first.dispose();
    // Simulate the kept-alive connection dropping while idle.
    created[0].client.isConnected.mockReturnValue(false);

    const second = await pool.acquire(params);
    expect(created[0].dispose).toHaveBeenCalled(); // stale one hard-closed
    expect(executor.connect).toHaveBeenCalledTimes(2); // fresh handshake
    expect(second.client).toBe(created[1].client);
  });

  it('dispose() is idempotent (only returns to the pool once)', async () => {
    const conn = await pool.acquire(params);
    await conn.dispose();
    await conn.dispose(); // no-op
    // A single idle entry → only one reuse is possible.
    await pool.acquire(params);
    const fresh = await pool.acquire(params);
    expect(executor.connect).toHaveBeenCalledTimes(2);
    expect(fresh.client).toBe(created[1].client);
  });

  it('hard-closes connections returned over the per-target capacity', async () => {
    // maxIdlePerKey = 4 → borrow 5 at once, return all 5; the 5th overflows.
    const conns = await Promise.all(
      Array.from({ length: 5 }, () => pool.acquire(params)),
    );
    expect(executor.connect).toHaveBeenCalledTimes(5);
    for (const c of conns) await c.dispose();

    const overflow = created.filter((c) => c.dispose.mock.calls.length > 0);
    expect(overflow).toHaveLength(1); // exactly one was closed, not pooled
  });

  it('keys by credentials — a different key never reuses a connection', async () => {
    const a = await pool.acquire(params);
    await a.dispose();
    await pool.acquire({ ...params, privateKey: 'KEY-B' });
    expect(executor.connect).toHaveBeenCalledTimes(2);
  });

  it('onModuleDestroy closes every idle connection', async () => {
    const a = await pool.acquire(params);
    const b = await pool.acquire({ ...params, port: 2222 });
    await a.dispose();
    await b.dispose();
    await pool.onModuleDestroy();
    expect(created[0].dispose).toHaveBeenCalled();
    expect(created[1].dispose).toHaveBeenCalled();
  });
});
