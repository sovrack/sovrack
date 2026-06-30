import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePagination } from "./use-pagination";

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("usePagination", () => {
  it("starts on page 1 and slices the first page", () => {
    const { result } = renderHook(() =>
      usePagination(range(25), { pageSize: 10 }),
    );
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.paged).toEqual(range(10));
  });

  it("navigates to a page and slices accordingly", () => {
    const { result } = renderHook(() =>
      usePagination(range(25), { pageSize: 10 }),
    );
    act(() => result.current.goToPage(2));
    expect(result.current.page).toBe(2);
    expect(result.current.paged).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it("clamps goToPage within [1, totalPages]", () => {
    const { result } = renderHook(() =>
      usePagination(range(25), { pageSize: 10 }),
    );
    act(() => result.current.goToPage(99));
    expect(result.current.page).toBe(3);
    act(() => result.current.goToPage(-5));
    expect(result.current.page).toBe(1);
  });

  it("reset returns to page 1", () => {
    const { result } = renderHook(() =>
      usePagination(range(25), { pageSize: 10 }),
    );
    act(() => result.current.goToPage(3));
    act(() => result.current.reset());
    expect(result.current.page).toBe(1);
  });

  it("always reports at least 1 page, even when empty", () => {
    const { result } = renderHook(() => usePagination([], { pageSize: 10 }));
    expect(result.current.totalPages).toBe(1);
    expect(result.current.paged).toEqual([]);
  });

  it("clamps the current page down when the list shrinks", () => {
    const { result, rerender } = renderHook(
      ({ items }) => usePagination(items, { pageSize: 10 }),
      { initialProps: { items: range(25) } },
    );
    act(() => result.current.goToPage(3));
    expect(result.current.page).toBe(3);
    rerender({ items: range(5) }); // now only 1 page
    expect(result.current.totalPages).toBe(1);
    expect(result.current.page).toBe(1);
  });

  it("defaults to a page size of 10", () => {
    const { result } = renderHook(() => usePagination(range(15)));
    expect(result.current.paged).toHaveLength(10);
    expect(result.current.totalPages).toBe(2);
  });
});
