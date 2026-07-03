import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useServiceActions } from "./use-service-actions";
import { containersService } from "@/features/platform";
import { deploymentsService } from "@/features/deployments";
import type { Service } from "@/features/projects/types/service";
import type { Deployment } from "@/features/deployments/types";

vi.mock("@/features/projects/api/services.service", () => ({
  servicesService: { remove: vi.fn() },
}));
vi.mock("@/features/deployments", () => ({
  deploymentsService: { create: vi.fn() },
}));
vi.mock("@/features/platform", () => ({
  containersService: {
    listByServiceEnv: vi.fn(),
    stop: vi.fn(),
  },
}));
vi.mock("@/features/projects/api/environments.service", () => ({
  environmentsService: { getServiceLinks: vi.fn() },
}));
const toastMock = vi.fn();
vi.mock("@/shared/contexts/toast-context", () => ({
  useToast: () => toastMock,
}));
vi.mock("@/shared/contexts/confirm-context", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const containers = vi.mocked(containersService);
const deployments = vi.mocked(deploymentsService);

const aService = (over: Partial<Service> = {}): Service =>
  ({
    id: "svc1",
    name: "app",
    envLinks: [
      { id: "senv-prod", environmentId: "env-prod", serverId: null },
      { id: "senv-staging", environmentId: "env-staging", serverId: null },
    ],
    ...over,
  }) as Service;

function setup(over: Partial<Parameters<typeof useServiceActions>[0]> = {}) {
  return renderHook(() =>
    useServiceActions({
      projectId: "p1",
      serviceId: "svc1",
      service: aService(),
      environments: [
        { id: "env-prod", name: "PRODUCTION" },
        { id: "env-staging", name: "STAGING" },
      ],
      selectedEnvId: "env-staging",
      lastDeployment: null as Deployment | null,
      onDeployOpen: vi.fn(),
      onReload: vi.fn(),
      ...over,
    }),
  );
}

describe("useServiceActions — Redeploy/Stop follow the selected environment (C3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleStop targets only the container of the currently selected environment", async () => {
    containers.listByServiceEnv.mockResolvedValue([
      { id: "c-staging", status: "RUNNING" } as never,
    ]);
    const { result } = setup({ selectedEnvId: "env-staging" });

    await result.current.handleStop();

    expect(containers.listByServiceEnv).toHaveBeenCalledWith("senv-staging");
    expect(containers.stop).toHaveBeenCalledWith("c-staging");
  });

  it("switching the selected environment changes which ServiceEnvironment handleStop targets", async () => {
    containers.listByServiceEnv.mockResolvedValue([
      { id: "c-prod", status: "RUNNING" } as never,
    ]);
    const { result } = setup({ selectedEnvId: "env-prod" });

    await result.current.handleStop();

    expect(containers.listByServiceEnv).toHaveBeenCalledWith("senv-prod");
  });

  it("handleStop errors out without calling stop when the service has no link to the selected environment", async () => {
    const { result } = setup({
      service: aService({ envLinks: [] }),
      selectedEnvId: "env-prod",
    });

    await result.current.handleStop();

    expect(containers.listByServiceEnv).not.toHaveBeenCalled();
    expect(containers.stop).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      "Service not linked to the selected environment.",
      "error",
    );
  });

  it("handleRedeploy deploys to the selected environment, not a hardcoded first one", async () => {
    deployments.create.mockResolvedValue({} as never);
    const { environmentsService } = await import(
      "@/features/projects/api/environments.service"
    );
    vi.mocked(environmentsService.getServiceLinks).mockResolvedValue([
      { id: "senv-prod", serviceId: "svc1" } as never,
    ]);
    const { result } = setup({ selectedEnvId: "env-prod" });

    await result.current.handleRedeploy();

    await waitFor(() =>
      expect(environmentsService.getServiceLinks).toHaveBeenCalledWith(
        "p1",
        "env-prod",
      ),
    );
    expect(deployments.create).toHaveBeenCalledWith(
      expect.objectContaining({ serviceEnvId: "senv-prod" }),
    );
  });
});
