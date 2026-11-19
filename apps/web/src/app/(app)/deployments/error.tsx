"use client";

import { SectionError } from "@/shared/common/section-error";

export default function DeploymentsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError {...props} title="Error in deployments" />;
}
