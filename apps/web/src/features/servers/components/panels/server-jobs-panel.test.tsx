import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ServerJobsPanel } from "./server-jobs-panel";
import type { ServerJob, ServerSetup } from "@/features/servers/types/server";

const baseProps = {
  serverId: "srv-1",
  jobsLoading: false,
  isBusy: false,
  retryingJobId: null,
  cancelingJobId: null,
  formatJobType: (type: ServerJob["type"]) => type,
  canRetryJob: () => false,
  canCancelJob: () => false,
  getJobStatusClassName: () => "",
  onRefreshJobs: vi.fn().mockResolvedValue(undefined),
  onRetryJob: vi.fn().mockResolvedValue(undefined),
  onCancelJob: vi.fn().mockResolvedValue(undefined),
  onViewSetupLogs: vi.fn(),
};

function makeJob(over: Partial<ServerJob> = {}): ServerJob {
  return {
    id: "job-1",
    serverId: "srv-1",
    type: "VERIFY",
    status: "SUCCESS",
    output: "line1\nline2\nline3",
    error: null,
    attempts: 1,
    maxAttempts: 3,
    timeoutMs: 45000,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    setupId: null,
    ...over,
  } as ServerJob;
}

// A2 (merge the separate "Logs" dialog into Job History): each row must
// expand in place to reveal the full detail that used to live behind the
// now-removed standalone "Logs" button, and PREPARE_SERVER jobs must offer a
// way to reach their step-by-step Ansible log via job.setupId.
describe("ServerJobsPanel — expand to reveal full detail (Task A2)", () => {
  it("truncates output by default and shows it in full once expanded", () => {
    const job = makeJob({ output: "line1\nline2\nline3" });
    render(<ServerJobsPanel {...baseProps} jobs={[job]} setups={[]} />);

    const row = screen.getByRole("button", {
      name: "Toggle details for VERIFY job",
    });
    expect(row).toBeTruthy();
    // Collapsed: truncated (line-clamp), not expanded content section.
    expect(screen.queryByText("No output recorded for this job.")).not.toBeInTheDocument();

    fireEvent.click(row!);
    expect(screen.getByText(/line1/)).toBeInTheDocument();
  });

  it("collapses again on a second click", () => {
    const job = makeJob();
    render(<ServerJobsPanel {...baseProps} jobs={[job]} setups={[]} />);
    const row = screen.getByRole("button", {
      name: "Toggle details for VERIFY job",
    });

    fireEvent.click(row);
    fireEvent.click(row);

    // Collapsed again: only the expanded-only section renders the
    // "no output" fallback text, and only when expanded — its absence here
    // confirms the row is back to collapsed, not stuck open.
    expect(
      screen.queryByText("No output recorded for this job."),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/line1/)).toHaveLength(1);
  });

  it("offers 'View step-by-step Ansible log' only for a PREPARE_SERVER job with a matching setup", () => {
    const job = makeJob({
      type: "PREPARE_SERVER",
      setupId: "run-42",
      output: "preparing…",
    });
    const setup = { id: "run-42", status: "SUCCEEDED" } as ServerSetup;
    render(
      <ServerJobsPanel
        {...baseProps}
        jobs={[job]}
        setups={[setup]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Toggle details for PREPARE_SERVER job",
      }),
    );
    const logButton = screen.getByRole("button", {
      name: /view step-by-step ansible log/i,
    });
    fireEvent.click(logButton);
    expect(baseProps.onViewSetupLogs).toHaveBeenCalledWith(setup);
  });

  it("does not offer the Ansible log button when no matching setup exists", () => {
    const job = makeJob({ type: "PREPARE_SERVER", setupId: "run-missing" });
    render(<ServerJobsPanel {...baseProps} jobs={[job]} setups={[]} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Toggle details for PREPARE_SERVER job",
      }),
    );
    expect(
      screen.queryByRole("button", { name: /view step-by-step ansible log/i }),
    ).not.toBeInTheDocument();
  });

  it("does not offer the Ansible log button for non-PREPARE_SERVER job types", () => {
    const job = makeJob({ type: "VERIFY" });
    render(<ServerJobsPanel {...baseProps} jobs={[job]} setups={[]} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle details for VERIFY job" }),
    );
    expect(
      screen.queryByRole("button", { name: /view step-by-step ansible log/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking Retry/Cancel does not toggle the row's expanded state", () => {
    const job = makeJob({ status: "FAILED" });
    render(
      <ServerJobsPanel
        {...baseProps}
        jobs={[job]}
        setups={[]}
        canRetryJob={() => true}
      />,
    );
    const retryButton = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryButton);

    expect(baseProps.onRetryJob).toHaveBeenCalledWith("srv-1", "job-1");
    // Row must still be collapsed — the retry click must not have expanded it.
    expect(screen.queryByText("No output recorded for this job.")).not.toBeInTheDocument();
  });
});
