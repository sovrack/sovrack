'use client';

import { useThemeContext } from '@/shared/contexts/theme-context';

export function useTheme() {
  return useThemeContext();
}
