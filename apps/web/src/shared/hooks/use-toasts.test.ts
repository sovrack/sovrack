import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToasts } from './use-toasts';

describe('useToasts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pushes a toast with the given message/tone', () => {
    const { result } = renderHook(() => useToasts(3000));
    act(() => result.current.showToast('Saved', 'success'));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      message: 'Saved',
      tone: 'success',
    });
  });

  it('auto-dismisses after the configured delay', () => {
    const { result } = renderHook(() => useToasts(2000));
    act(() => result.current.showToast('Bye', 'error'));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('dismiss() removes a specific toast immediately', () => {
    const { result } = renderHook(() => useToasts(9999));
    act(() => result.current.showToast('a', 'success'));
    const id = result.current.toasts[0].id;
    act(() => result.current.dismiss(id));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('stacks multiple toasts', () => {
    const { result } = renderHook(() => useToasts(9999));
    act(() => {
      result.current.showToast('one', 'success');
      result.current.showToast('two', 'error');
    });
    expect(result.current.toasts).toHaveLength(2);
  });
});
