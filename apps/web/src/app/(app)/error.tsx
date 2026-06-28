'use client';

import { SectionError } from '@/shared/common/section-error';

export default function AppError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError {...props} />;
}
