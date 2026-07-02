import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDeployValidation } from "./use-deploy-validation";
import { deploymentsService } from "@/features/deployments";
import type { Environment } from "@/features/projects";
import type { Service } from "@/features/projects";
import type { DeployValidationResult } from "@/features/deployments";

vi.mock("@/features/deployments", () => ({
  deploymentsService: {
    validate: vi.fn(),
  },
}));

const mocked = vi.mocked(deploymentsService);

const aService = (over: Partial<Service> = {}): Service => ({
  id: "svc1",
  projectId: "p1",
  environmentId: null,
  type: "APPLICATION",
  sourceType: "GIT",
  name: "api",
  description: null,
  repoPath: "org/repo",
  repoUrl: null,
  branch: "main",
  providerId: "prov1",
  rootDir: "/",
  buildPack: "NIXPACKS",
  buildMode: "LOCAL",
  deployTrigger: "PUSH",
  registryImage: null,
  buildType: null,
  dockerfile: null,
  port: 3000,
  startCommand: null,
  healthcheckPath: null,
  replicas: 1,
  databaseType: null,
  databaseVersion: null,
  env: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const anEnvironment = (over: Partial<Environment> = {}): Environment => ({
  id: "env1",
  name: "PRODUCTION",
  projectId: "p1",
  env: null,
  serviceLinks: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const aValidationResult = (
  over: Partial<DeployValidationResult> = {},
): DeployValidationResult => ({
  ready: true,
  prepared: true,
  missing: [],
  required: [],
  serverName: "srv1",
  serverId: "srv1",
  buildSource: "DOCKERFILE_LOCAL",
  ...over,
});

function baseParams(
  over: Partial<Parameters<typeof useDeployValidation>[0]> = {},
) {
  return {
    projectId: "p1",
    open: true,
    loading: false,
    services: [aService()],
    selectedServiceId: "svc1",
    environments: [anEnvironment()],
    primaryEnvId: "env1",
    effectiveBuildSource: "DOCKERFILE_LOCAL" as const,
    ...over,
  };
}

describe("useDeployValidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports no-source and no-build-config issues for a service without a repo", async () => {
    const svc = aService({ repoPath: null, repoUrl: null });
    mocked.validate.mockResolvedValue(aValidationResult());
    const { result } = renderHook(() =>
      useDeployValidation(baseParams({ services: [svc] })),
    );
    expect(result.current.issues.map((i) => i.type)).toEqual(
      expect.arrayContaining(["no-source", "no-build-config"]),
    );
  });

  it("reports no-environment when there are no environments", () => {
    const { result } = renderHook(() =>
      useDeployValidation(baseParams({ environments: [], primaryEnvId: "" })),
    );
    expect(result.current.issues).toEqual([
      expect.objectContaining({ type: "no-environment" }),
    ]);
  });

  it("skips server-side validation while a no-environment issue is present", async () => {
    renderHook(() =>
      useDeployValidation(baseParams({ environments: [], primaryEnvId: "" })),
    );
    await waitFor(() => expect(mocked.validate).not.toHaveBeenCalled());
  });

  it("calls deploymentsService.validate for the primary environment and surfaces the result", async () => {
    mocked.validate.mockResolvedValue(aValidationResult({ ready: false, missing: [{ binary: "docker", label: "Docker", role: "runtime" }] }));
    const { result } = renderHook(() => useDeployValidation(baseParams()));

    await waitFor(() => expect(result.current.validating).toBe(false));
    expect(mocked.validate).toHaveBeenCalledWith(
      "p1",
      "env1",
      "DOCKERFILE_LOCAL",
    );
    expect(result.current.validation?.ready).toBe(false);
    expect(result.current.validation?.missing).toHaveLength(1);
  });

  it("surfaces a server-side validation error via validateError", async () => {
    mocked.validate.mockRejectedValue(new Error("server down"));
    const { result } = renderHook(() => useDeployValidation(baseParams()));

    await waitFor(() => expect(result.current.validateError).toBeTruthy());
    expect(result.current.validation).toBeNull();
  });

  it("does not call validate while the dialog is closed", () => {
    renderHook(() => useDeployValidation(baseParams({ open: false })));
    expect(mocked.validate).not.toHaveBeenCalled();
  });

  it("clears validation/validateError once the dialog closes", async () => {
    mocked.validate.mockResolvedValue(aValidationResult());
    const { result, rerender } = renderHook(
      (props) => useDeployValidation(props),
      { initialProps: baseParams() },
    );
    await waitFor(() => expect(result.current.validation).not.toBeNull());

    rerender(baseParams({ open: false }));
    expect(result.current.validation).toBeNull();
    expect(result.current.validateError).toBeNull();
  });
});
