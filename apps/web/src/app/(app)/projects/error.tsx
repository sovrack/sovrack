'use client';

import { SectionError } from '@/shared/common/section-error';

export default function ProjectsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError {...props} title="Erreur dans les projets" />;
}
