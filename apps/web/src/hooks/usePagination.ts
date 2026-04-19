'use client';

import { useState, useMemo } from 'react';

type UsePaginationOptions = {
  pageSize?: number;
};

export function usePagination<T>(items: T[], options: UsePaginationOptions = {}) {
  const { pageSize = 10 } = options;
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const safePageSize = Math.max(1, pageSize);
  const paged = useMemo(() => {
    const start = (page - 1) * safePageSize;
    return items.slice(start, start + safePageSize);
  }, [items, page, safePageSize]);

  const goToPage = (p: number) => {
    setPage(Math.min(Math.max(1, p), totalPages));
  };

  const reset = () => setPage(1);

  return { page, totalPages, paged, goToPage, reset };
}
