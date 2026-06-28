import { BadRequestException } from '@nestjs/common';
import {
  assertSafeLinuxUsername,
  shellQuote,
  onAbort,
  assertNotAborted,
} from './servers-shell.util';

describe('assertSafeLinuxUsername', () => {
  it('accepts valid Linux usernames', () => {
    expect(() => assertSafeLinuxUsername('deploy')).not.toThrow();
    expect(() => assertSafeLinuxUsername('_svc-01')).not.toThrow();
  });

  it('rejects usernames with shell-dangerous characters', () => {
    expect(() => assertSafeLinuxUsername('root; rm -rf /')).toThrow(
      BadRequestException,
    );
    expect(() => assertSafeLinuxUsername('1user')).toThrow(BadRequestException);
    expect(() => assertSafeLinuxUsername('')).toThrow(BadRequestException);
  });
});

describe('shellQuote', () => {
  it('wraps a value in single quotes', () => {
    expect(shellQuote('hello')).toBe("'hello'");
  });

  it('escapes embedded single quotes so the value cannot break out', () => {
    // ' rm -rf / ' must stay a single inert argument.
    expect(shellQuote("a'b")).toBe(`'a"'"'b'`);
  });
});

describe('onAbort', () => {
  it('returns a no-op when no signal is provided', () => {
    const handler = jest.fn();
    const cleanup = onAbort(undefined, handler);
    expect(handler).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it('calls the handler immediately when the signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const handler = jest.fn();
    onAbort(controller.signal, handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('calls the handler once when the signal aborts later, and cleans up', () => {
    const controller = new AbortController();
    const handler = jest.fn();
    const cleanup = onAbort(controller.signal, handler);
    controller.abort();
    expect(handler).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe('assertNotAborted', () => {
  it('does nothing when the signal is not aborted', () => {
    const controller = new AbortController();
    expect(() =>
      assertNotAborted({ signal: controller.signal, timeoutMs: 1000 }),
    ).not.toThrow();
  });

  it('throws a JOB_TIMEOUT error once the signal is aborted', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      assertNotAborted({ signal: controller.signal, timeoutMs: 1000 }),
    ).toThrow('JOB_TIMEOUT_1000');
  });
});
