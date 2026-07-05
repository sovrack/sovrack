"use client";

import { useEffect, useState } from "react";
import { Server as ServerIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import {
  ServerOverallStatusBadge,
  ServerToolBadges,
  ServerWorkflowBadges,
} from "@/features/servers/components/shared/server-status-badges";
import { ServerJobsPanel } from "@/features/servers/components/panels/server-jobs-panel";
import { ServerSetupLogViewer } from "@/features/servers/components/panels/server-setup-log-viewer";
import { useServerSetups } from "@/features/servers/api/use-server-setup";
import type {
  Server,
  ServerJob,
  ServerSetup,
} from "@/features/servers/types/server";

type ServerDetailsDialogProps = {
  open: boolean;
  server: Server | null;
  jobs: ServerJob[];
  jobsLoading: boolean;
  isBusy: boolean;
  retryingJobId: string | null;
  cancelingJobId?: string | null;
  formatJobType: (type: ServerJob["type"]) => string;
  canRetryJob: (job: ServerJob) => boolean;
  canCancelJob?: (job: ServerJob) => boolean;
  getJobStatusClassName: (status: ServerJob["status"]) => string;
  onClose: () => void;
  onRefreshJobs: (serverId: string) => Promise<void>;
  onRetryJob: (serverId: string, jobId: string) => Promise<void>;
  onCancelJob?: (serverId: string, jobId: string) => Promise<void>;
};

export function ServerDetailsDialog({
  open,
  server,
  jobs,
  jobsLoading,
  isBusy,
  retryingJobId,
  cancelingJobId,
  formatJobType,
  canRetryJob,
  canCancelJob,
  getJobStatusClassName,
  onClose,
  onRefreshJobs,
  onRetryJob,
  onCancelJob,
}: ServerDetailsDialogProps) {
  // A2: Job History rows for PREPARE_SERVER jobs link to the ServerRun they
  // triggered (job.setupId) — reuses the same setups list/log
  // viewer already used by the server detail page, instead of the removed
  // standalone "Logs" dialog duplicating that same data.
  const [selectedSetup, setSelectedSetup] =
    useState<ServerSetup | null>(null);
  const setupsQuery = useServerSetups(open ? (server?.id ?? "") : "");

  useEffect(() => {
    if (!open || !server) {
      return;
    }
    if (jobs.length === 0 && !jobsLoading) {
      void onRefreshJobs(server.id);
    }
  }, [jobs.length, jobsLoading, onRefreshJobs, open, server]);

  if (!server) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Server Details"
      description={`${server.name} · ${server.username}@${server.host}:${server.port}`}
      icon={
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--text-primary)]/15">
          <ServerIcon size={16} className="text-[var(--text-secondary)]" />
        </div>
      }
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-card)]">
              <ServerIcon size={18} className="text-[var(--text-secondary)]" />
            </div>
            <div className="space-y-2">
              <ServerOverallStatusBadge server={server} />
              <ServerWorkflowBadges server={server} />
              {/* Task 2 ("Sécurité database + UI" mission): installed-tool
                  badges (Docker/Nginx/Nixpacks…) moved here from the server
                  list (now a compact table) — this detail panel is their
                  only home now. */}
              <ServerToolBadges server={server} />
              <p className="text-xs text-[var(--text-secondary)]">
                Ansible is executed from the platform control node. This VPS is
                managed through SSH and does not need Ansible installed locally.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Last SSH validation
            </p>
            <p className="mt-2 text-sm text-[var(--text-primary)]">
              {server.lastVerifiedAt
                ? new Date(server.lastVerifiedAt).toLocaleString()
                : "Not validated yet"}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Last detection
            </p>
            <p className="mt-2 text-sm text-[var(--text-primary)]">
              {server.lastDetectedAt
                ? new Date(server.lastDetectedAt).toLocaleString()
                : "Not detected yet"}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Last setup
            </p>
            <p className="mt-2 text-sm text-[var(--text-primary)]">
              {server.lastPreparedAt
                ? new Date(server.lastPreparedAt).toLocaleString()
                : "Not set up yet"}
            </p>
          </div>
        </div>

        <ServerJobsPanel
          serverId={server.id}
          jobs={jobs}
          jobsLoading={jobsLoading}
          isBusy={isBusy}
          retryingJobId={retryingJobId}
          cancelingJobId={cancelingJobId}
          formatJobType={formatJobType}
          canRetryJob={canRetryJob}
          canCancelJob={canCancelJob}
          getJobStatusClassName={getJobStatusClassName}
          onRefreshJobs={onRefreshJobs}
          onRetryJob={onRetryJob}
          onCancelJob={onCancelJob}
          setups={setupsQuery.data ?? []}
          onViewSetupLogs={setSelectedSetup}
        />
      </div>

      <ServerSetupLogViewer
        setup={selectedSetup}
        onClose={() => setSelectedSetup(null)}
      />
    </Modal>
  );
}
