import { ok, err, unwrap, type Result } from './result.type';

describe('Result<T, E>', () => {
  it('ok() builds a success carrying the value', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('err() builds a failure carrying the error', () => {
    const r = err('boom');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('boom');
  });

  it('unwrap() returns the value on success', () => {
    expect(unwrap(ok('x'))).toBe('x');
  });

  it('unwrap() rethrows an Error error as-is', () => {
    const boom = new Error('nope');
    expect(() => unwrap(err(boom))).toThrow(boom);
  });

  it('unwrap() wraps a non-Error error into an Error', () => {
    expect(() => unwrap(err('plain string'))).toThrow('plain string');
  });

  it('narrows the union via the ok discriminant', () => {
    const compute = (n: number): Result<number, string> =>
      n >= 0 ? ok(n * 2) : err('negative');
    const a = compute(3);
    const b = compute(-1);
    expect(a.ok && a.value).toBe(6);
    expect(!b.ok && b.error).toBe('negative');
  });
});
