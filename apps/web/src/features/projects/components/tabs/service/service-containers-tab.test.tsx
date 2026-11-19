import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ServiceContainersTab } from "./service-containers-tab";
import { monitoringService } from "@/features/monitoring";
import { containersService } from "@/features/platform";

vi.mock("@/features/monitoring", () => ({
  monitoringService: { getContainerInfo: vi.fn() },
}));
vi.mock("@/features/platform", () => ({
  containersService: {
    listByServiceEnv: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    remove: vi.fn(),
  },
}));

const monitoring = vi.mocked(monitoringService);
const containers = vi.mocked(containersService);

// jsdom doesn't implement scrollIntoView (ContainerOpsPanel auto-scrolls logs).
Element.prototype.scrollIntoView = vi.fn();

describe("ServiceContainersTab (C4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a placeholder when no environment is selected", () => {
    render(
      <ServiceContainersTab serviceEnvId={null} currentDeploymentId={null} />,
    );
    expect(screen.getByText(/no environment selected/i)).toBeInTheDocument();
    expect(containers.listByServiceEnv).not.toHaveBeenCalled();
  });

  it("fetches the container scoped by serviceEnvId and stats scoped by currentDeploymentId", async () => {
    containers.listByServiceEnv.mockResolvedValue([
      { id: "c1", status: "RUNNING" } as never,
    ]);
    monitoring.getContainerInfo.mockResolvedValue({
      status: "running",
      logs: "hello world",
      stats: { cpuPercent: "3%", memPercent: "10%", memUsage: "10MB", netIO: "1KB" },
    } as never);

    render(
      <ServiceContainersTab
        serviceEnvId="senv1"
        currentDeploymentId="dep1"
      />,
    );

    await waitFor(() =>
      expect(containers.listByServiceEnv).toHaveBeenCalledWith("senv1"),
    );
    expect(monitoring.getContainerInfo).toHaveBeenCalledWith("dep1", 200);
    await waitFor(() =>
      expect(screen.getByText("hello world")).toBeInTheDocument(),
    );
  });
});
