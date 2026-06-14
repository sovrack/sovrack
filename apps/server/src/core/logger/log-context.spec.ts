import { getLogContext, runWithLogContext, setLogContext } from './log-context';

describe('log-context', () => {
  it('returns an empty context outside any scope', () => {
    expect(getLogContext()).toEqual({});
  });

  it('exposes the context inside runWithLogContext', () => {
    const seen = runWithLogContext({ correlationId: 'req-1' }, () => getLogContext());
    expect(seen).toEqual({ correlationId: 'req-1' });
  });

  it('propagates across async boundaries', async () => {
    const result = await runWithLogContext({ correlationId: 'req-2' }, async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      return getLogContext().correlationId;
    });
    expect(result).toBe('req-2');
  });

  it('setLogContext enriches the active context in place', () => {
    const seen = runWithLogContext({ correlationId: 'req-3' }, () => {
      setLogContext({ deploymentId: 'dep-9', serviceEnvId: 'se-9' });
      return getLogContext();
    });
    expect(seen).toMatchObject({
      correlationId: 'req-3',
      deploymentId: 'dep-9',
      serviceEnvId: 'se-9',
    });
  });

  it('isolates sibling scopes', () => {
    const a = runWithLogContext({ correlationId: 'a' }, () => getLogContext().correlationId);
    const b = runWithLogContext({ correlationId: 'b' }, () => getLogContext().correlationId);
    expect(a).toBe('a');
    expect(b).toBe('b');
    expect(getLogContext()).toEqual({});
  });
});
