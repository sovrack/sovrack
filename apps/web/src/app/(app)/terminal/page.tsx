"use client";

import { Suspense } from "react";
import { TerminalHub } from "@/features/terminal/components/terminal-hub";

export default function TerminalPage() {
  return (
    <Suspense fallback={null}>
      <TerminalHub />
    </Suspense>
  );
}
