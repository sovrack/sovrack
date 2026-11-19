"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UsePaginationOptions = {
  pageSize?: number;
};

export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {},
) {
  const { pageSize = 10 } = options;
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const safePageSize = Math.max(1, pageSize);
  const paged = useMemo(() => {
    const start = (page - 1) * safePageSize;
    return items.slice(start, start + safePageSize);
  }, [items, page, safePageSize]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const goToPage = useCallback(
    (p: number) => {
      setPage(Math.min(Math.max(1, p), totalPages));
    },
    [totalPages],
  );

  const reset = useCallback(() => setPage(1), []);

  return { page, totalPages, paged, goToPage, reset };
}
