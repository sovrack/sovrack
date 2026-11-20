"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import api, { getApiErrorMessage } from "@/shared/lib/api";
import { useAuth } from "@/features/auth/api/use-auth";
import { teamsService } from "@/features/teams/api/teams.service";
import type { WorkspaceSummary } from "@/features/teams/types/team";
import { useWorkspaceStore } from "@/stores/workspace.store";

function InvitationAcceptance() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, loading } = useAuth();
  const setWorkspaces = useWorkspaceStore((state) => state.setWorkspaces);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const token = searchParams.get("token")?.trim() ?? "";

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      const next = `/invitations/accept?token=${encodeURIComponent(token)}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [isAuthenticated, loading, router, token]);

  const accept = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await teamsService.acceptInvitation(token);
      const response = await api.get<WorkspaceSummary[]>("/workspaces");
      setWorkspaces(response.data);
      router.replace("/dashboard");
    } catch (acceptError) {
      setError(getApiErrorMessage(acceptError));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold">Workspace invitation</h1>
        <p className="mt-2 text-sm text-secondary">
          Confirm that you want to join this workspace with the current account.
        </p>
        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        <button
          type="button"
          onClick={() => void accept()}
          disabled={!token || submitting}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Accept invitation
        </button>
      </section>
    </main>
  );
}

export default function InvitationAcceptancePage() {
  return (
    <Suspense fallback={null}>
      <InvitationAcceptance />
    </Suspense>
  );
}
