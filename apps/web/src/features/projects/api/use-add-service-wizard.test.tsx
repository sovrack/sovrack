import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAddServiceWizard } from "./use-add-service-wizard";
import { servicesService } from "@/features/projects/api/services.service";
import { projectsService } from "@/features/projects/api/projects.service";
import type { SourceProviderOption } from "@/features/projects/types/project";
import type { DiscoveredRepo, ServiceTemplate } from "@/features/projects/types/service";

vi.mock("@/features/projects/api/services.service", () => ({
  servicesService: {
    listTemplates: vi.fn(),
    discoverGroup: vi.fn(),
    create: vi.fn(),
    createFromTemplate: vi.fn(),
  },
}));

vi.mock("@/features/projects/api/projects.service", () => ({
  projectsService: {
    getSourceProviders: vi.fn(),
  },
}));

const mockedServices = vi.mocked(servicesService);
const mockedProjects = vi.mocked(projectsService);

const gitlabProvider: SourceProviderOption = {
  id: "prov-gitlab",
  name: "GitLab",
  type: "GITLAB",
  url: "https://gitlab.com",
  isDefault: true,
  status: "CONFIGURED",
};

function setup(over: Partial<Parameters<typeof useAddServiceWizard>[0]> = {}) {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  mockedProjects.getSourceProviders.mockResolvedValue([gitlabProvider]);
  const utils = renderHook((props) => useAddServiceWizard(props), {
    initialProps: { projectId: "p1", open: true, onCreated, onClose, ...over },
  });
  return { ...utils, onCreated, onClose };
}

describe("useAddServiceWizard — state management (useReducer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedProjects.getSourceProviders.mockResolvedValue([gitlabProvider]);
  });

  it("starts on step 1 with no kind selected", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.providers).toHaveLength(1));
    expect(result.current.step).toBe(1);
    expect(result.current.kind).toBeNull();
  });

  it("auto-picks the default provider once providers load", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.providerId).toBe("prov-gitlab"));
  });

  it("pickKind moves to step 2 and resets platform/error", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.providers).toHaveLength(1));

    act(() => result.current.pickKind("DOCKER"));

    expect(result.current.kind).toBe("DOCKER");
    expect(result.current.step).toBe(2);
    expect(result.current.platform).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("pickKind('TEMPLATE') loads templates and preselects the first one", async () => {
    const templates: ServiceTemplate[] = [
      { id: "t1", name: "Postgres+pgAdmin", description: "", services: [] },
    ];
    mockedServices.listTemplates.mockResolvedValue(templates);
    const { result } = setup();
    await waitFor(() => expect(result.current.providers).toHaveLength(1));

    act(() => result.current.pickKind("TEMPLATE"));
    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    expect(result.current.templateId).toBe("t1");
    expect(result.current.selectedTemplate).toEqual(templates[0]);
  });

  it("pickPlatform selects the default provider for that platform", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.providers).toHaveLength(1));

    act(() => result.current.pickPlatform("GITLAB"));

    expect(result.current.platform).toBe("GITLAB");
    expect(result.current.providerId).toBe("prov-gitlab");
  });

  it("toggleRepo adds then removes a repo from the selection", async () => {
    const { result } = setup();
    act(() => result.current.toggleRepo("org/app"));
    expect(result.current.selected.has("org/app")).toBe(true);
    act(() => result.current.toggleRepo("org/app"));
    expect(result.current.selected.has("org/app")).toBe(false);
  });

  it("discover populates discovered + auto-selects all repos found", async () => {
    const repos: DiscoveredRepo[] = [
      { repoPath: "org/a", name: "a", defaultBranch: "main" },
      { repoPath: "org/b", name: "b", defaultBranch: "main" },
    ];
    mockedServices.discoverGroup.mockResolvedValue(repos);
    const { result } = setup();
    await waitFor(() => expect(result.current.providers).toHaveLength(1));

    act(() => result.current.pickPlatform("GITLAB"));
    act(() => result.current.setGroupPath("org"));

    await act(async () => {
      await result.current.discover();
    });

    expect(result.current.discovering).toBe(false);
    expect(result.current.discovered).toEqual(repos);
    expect(result.current.selected.size).toBe(2);
  });

  it("discover sets an error and does not call the API when group path is missing", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.providers).toHaveLength(1));
    act(() => result.current.pickPlatform("GITLAB"));

    await act(async () => {
      await result.current.discover();
    });

    expect(mockedServices.discoverGroup).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/group\/org path required/i);
  });

  it("submit creates a DOCKER service then calls onCreated/onClose", async () => {
    mockedServices.create.mockResolvedValue({ id: "svc1" } as never);
    const { result, onCreated, onClose } = setup();
    await waitFor(() => expect(result.current.providers).toHaveLength(1));

    act(() => result.current.pickKind("DOCKER"));
    act(() => result.current.setName("worker"));
    act(() => result.current.setImage("redis:7"));

    await act(async () => {
      await result.current.submit();
    });

    expect(mockedServices.create).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ name: "worker", sourceType: "DOCKER_IMAGE" }),
    );
    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it("submit surfaces the API error and leaves the wizard open on failure", async () => {
    mockedServices.create.mockRejectedValue(new Error("boom"));
    const { result, onCreated, onClose } = setup();
    await waitFor(() => expect(result.current.providers).toHaveLength(1));

    act(() => result.current.pickKind("DOCKER"));
    act(() => result.current.setName("worker"));
    act(() => result.current.setImage("redis:7"));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.submitting).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reopening the wizard resets form fields but keeps providers/providerId", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.providerId).toBe("prov-gitlab"));

    act(() => result.current.pickKind("DOCKER"));
    act(() => result.current.setName("worker"));
    expect(result.current.step).toBe(2);

    rerender({ projectId: "p1", open: false, onCreated: vi.fn(), onClose: vi.fn() });
    rerender({ projectId: "p1", open: true, onCreated: vi.fn(), onClose: vi.fn() });

    await waitFor(() => expect(result.current.step).toBe(1));
    expect(result.current.kind).toBeNull();
    expect(result.current.name).toBe("");
    // providerId is re-derived by the unconditional provider fetch, not wiped.
    expect(result.current.providerId).toBe("prov-gitlab");
  });

  it("canReview requires name+image for DOCKER and name+composeContent for COMPOSE", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.providers).toHaveLength(1));

    act(() => result.current.pickKind("DOCKER"));
    expect(result.current.canReview).toBe(false);
    act(() => result.current.setName("worker"));
    act(() => result.current.setImage("redis:7"));
    expect(result.current.canReview).toBe(true);

    // pickKind does not clear name/composeContent (only a full reopen does),
    // so start this sub-case from an explicitly empty name.
    act(() => result.current.pickKind("COMPOSE"));
    act(() => result.current.setName(""));
    expect(result.current.canReview).toBe(false);
    act(() => result.current.setComposeContent("services: {}"));
    expect(result.current.canReview).toBe(false);
    act(() => result.current.setName("stack"));
    expect(result.current.canReview).toBe(true);
  });
});
