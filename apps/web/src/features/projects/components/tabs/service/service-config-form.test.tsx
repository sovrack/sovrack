import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { ServiceConfigForm } from "./service-config-form";
import { servicesService } from "@/features/projects/api/services.service";
import { projectsService } from "@/features/projects/api/projects.service";
import { environmentsService } from "@/features/projects/api/environments.service";
import { useProjectBranches } from "@/features/projects/api/use-project-branches";
import type { Service } from "@/features/projects/types/service";

vi.mock("@/features/projects/api/services.service", () => ({
  servicesService: { update: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/features/projects/api/projects.service", () => ({
  projectsService: { getSourceProviders: vi.fn() },
}));
vi.mock("@/features/projects/api/environments.service", () => ({
  environmentsService: {
    getServiceLink: vi.fn(),
    updateServiceLink: vi.fn(),
    linkService: vi.fn(),
    getServiceLinks: vi.fn(),
  },
}));
vi.mock("@/features/projects/api/use-project-branches", () => ({
  useProjectBranches: vi.fn(),
}));

const mockedServices = vi.mocked(servicesService);
const mockedProjects = vi.mocked(projectsService);
const mockedEnvironments = vi.mocked(environmentsService);
const mockedBranches = vi.mocked(useProjectBranches);

function renderForm(
  overrides: Partial<ComponentProps<typeof ServiceConfigForm>> = {},
) {
  return render(
    <ServiceConfigForm
      projectId="p1"
      service={service}
      environmentId="env1"
      serviceEnvId="senv1"
      onSaved={vi.fn()}
      {...overrides}
    />,
  );
}

const service: Service = {
  id: "svc1",
  projectId: "p1",
  environmentId: null,
  type: "APPLICATION",
  sourceType: "GIT",
  name: "api",
  description: null,
  repoPath: "group/api",
  repoUrl: null,
  branch: "main",
  providerId: "prov1",
  rootDir: null,
  buildPack: "DOCKERFILE",
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
} as Service;

// B1: Provider + Repository path must be strictly read-only once a service
// exists — a clickable provider picker previously let them be switched
// post-creation, silently drifting from the webhook (still registered
// against the ORIGINAL provider) — see AUDIT_VERIFICATION_UI.md Point 5.
describe("ServiceConfigForm — Provider/Repo locked (Task B1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnvironments.getServiceLink.mockResolvedValue({
      autoDeploy: false,
      autoBranch: "main",
    } as never);
    mockedProjects.getSourceProviders.mockResolvedValue([
      {
        id: "prov1",
        name: "Company GitLab",
        type: "GITLAB",
        url: "https://gitlab.company.com",
        isDefault: true,
        status: "CONFIGURED",
      },
      {
        id: "prov2",
        name: "Personal GitHub",
        type: "GITHUB",
        url: "https://github.com",
        isDefault: false,
        status: "CONFIGURED",
      },
    ] as never);
    mockedBranches.mockReturnValue({ data: [{ name: "main" }, { name: "dev" }] } as never);
  });

  it("shows the provider as plain text, not a clickable picker", async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByText(/Company GitLab/)).toBeInTheDocument(),
    );
    // The picker used to render one <button> per provider (2 here) — none
    // must remain clickable/present for provider selection.
    expect(
      screen.queryByRole("button", { name: /Personal GitHub/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Company GitLab/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the repository path as plain text, not an editable/readOnly input", async () => {
    renderForm();
    await waitFor(() => screen.getByText("group/api"));
    expect(screen.queryByRole("textbox", { name: /repository/i })).toBeNull();
  });

  it("never sends providerId or repoPath in the update payload for a GIT-sourced service", async () => {
    renderForm();
    await waitFor(() => screen.getByText("group/api"));

    fireEvent.click(screen.getByRole("button", { name: /save configuration/i }));

    await waitFor(() => expect(mockedServices.update).toHaveBeenCalledTimes(1));
    const [, , payload] = mockedServices.update.mock.calls[0];
    expect(payload).not.toHaveProperty("providerId");
    expect(payload).not.toHaveProperty("repoPath");
  });
});

// B2: the locked repo path (B1) becomes a real, clickable link to the repo's
// actual web page — built from the provider's own base URL + repoPath, no
// new backend data required.
describe("ServiceConfigForm — repo path links to the real repo URL (Task B2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnvironments.getServiceLink.mockResolvedValue({
      autoDeploy: false,
      autoBranch: "main",
    } as never);
  });

  it("links the repo path to providerUrl + repoPath, opening in a new tab", async () => {
    mockedProjects.getSourceProviders.mockResolvedValue([
      {
        id: "prov1",
        name: "Company GitLab",
        type: "GITLAB",
        url: "https://gitlab.company.com",
        isDefault: true,
        status: "CONFIGURED",
      },
    ] as never);
    mockedBranches.mockReturnValue({ data: [] } as never);

    renderForm();

    const link = await screen.findByRole("link", { name: /group\/api/ });
    expect(link).toHaveAttribute(
      "href",
      "https://gitlab.company.com/group/api",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("falls back to plain text (no link) when the provider can't be resolved", async () => {
    mockedProjects.getSourceProviders.mockResolvedValue([] as never);
    mockedBranches.mockReturnValue({ data: [] } as never);

    renderForm();

    await waitFor(() => screen.getByText("group/api"));
    expect(
      screen.queryByRole("link", { name: /group\/api/ }),
    ).not.toBeInTheDocument();
  });
});

// "Correction rapide" mission, Task 2: the Branch field used to be a free-text
// input with a <datalist> autocomplete hint — confirmed by manual test that a
// real, existing branch ("dev") never appeared as a selectable option. It now
// reuses DeployDialog's exact fetching mechanism (useProjectBranches) and
// select/fallback pattern.
describe("ServiceConfigForm — dynamic branch selector (Task 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnvironments.getServiceLink.mockResolvedValue({
      autoDeploy: false,
      autoBranch: "main",
    } as never);
    mockedProjects.getSourceProviders.mockResolvedValue([
      {
        id: "prov1",
        name: "Company GitLab",
        type: "GITLAB",
        url: "https://gitlab.company.com",
        isDefault: true,
        status: "CONFIGURED",
      },
    ] as never);
  });

  it("lists every real branch returned by the API as a selectable option", async () => {
    mockedBranches.mockReturnValue({
      data: [{ name: "main" }, { name: "dev" }, { name: "release/1.0" }],
      isLoading: false,
    } as never);

    renderForm();

    const select = await screen.findByLabelText("Branch");
    expect(select.tagName).toBe("SELECT");
    const options = Array.from(
      (select as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(options).toEqual(["main", "dev", "release/1.0"]);
  });

  it("shows a loading indicator while branches are being fetched", () => {
    mockedBranches.mockReturnValue({ data: undefined, isLoading: true } as never);

    renderForm();

    expect(screen.getByText(/loading branches/i)).toBeInTheDocument();
  });

  it("falls back to a free-text input when the branch list is empty (no branches / fetch failed)", async () => {
    mockedBranches.mockReturnValue({ data: [], isLoading: false } as never);

    renderForm();

    await waitFor(() => screen.getByText("group/api"));
    const branchField = screen.getByLabelText("Branch");
    expect(branchField.tagName).toBe("INPUT");
  });

  it("keeps the service's current branch selectable even if it's missing from the fetched list", async () => {
    // service.branch is "main" but the API only returns other branches —
    // must not silently switch the selection (and thus the saved value).
    mockedBranches.mockReturnValue({
      data: [{ name: "dev" }, { name: "release/1.0" }],
      isLoading: false,
    } as never);

    renderForm();

    const select = (await screen.findByLabelText(
      "Branch",
    )) as HTMLSelectElement;
    expect(select.value).toBe("main");
    expect(
      Array.from(select.options).map((o) => o.value),
    ).toEqual(["main", "dev", "release/1.0"]);
  });
});

// "Correction rapide" mission, Task 1: Auto-deploy on push moved here from
// the old Variables tab, next to Deployment trigger — confirmed DISTINCT
// settings (Service.deployTrigger vs ServiceEnvironment.autoDeploy/autoBranch),
// not a duplicate, so both now live in General/Build without merging.
describe("ServiceConfigForm — Auto-deploy on push moved from Variables (Task 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedProjects.getSourceProviders.mockResolvedValue([] as never);
    mockedBranches.mockReturnValue({ data: [], isLoading: false } as never);
  });

  it("shows Auto-deploy on push next to Deployment trigger, loaded from the ServiceEnvironment", async () => {
    mockedEnvironments.getServiceLink.mockResolvedValue({
      autoDeploy: true,
      autoBranch: "develop",
    } as never);

    renderForm();

    await waitFor(() =>
      expect(mockedEnvironments.getServiceLink).toHaveBeenCalledWith(
        "p1",
        "senv1",
      ),
    );
    await waitFor(() =>
      expect(
        (screen.getByDisplayValue("develop") as HTMLInputElement).value,
      ).toBe("develop"),
    );
    expect(
      screen.getByRole("checkbox", { name: /enabled/i }),
    ).toBeChecked();
    expect(screen.getByText(/deployment trigger/i)).toBeInTheDocument();
  });

  it("saves the auto-deploy toggle via the ServiceEnvironment endpoint alongside the Service update", async () => {
    mockedEnvironments.getServiceLink.mockResolvedValue({
      autoDeploy: false,
      autoBranch: "main",
    } as never);
    mockedEnvironments.updateServiceLink.mockResolvedValue(undefined);

    renderForm();
    await waitFor(() =>
      expect(mockedEnvironments.getServiceLink).toHaveBeenCalled(),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /enabled/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /save configuration/i }),
    );

    await waitFor(() =>
      expect(mockedEnvironments.updateServiceLink).toHaveBeenCalledWith(
        "p1",
        "senv1",
        { autoDeploy: true, autoBranch: "main" },
      ),
    );
    expect(mockedServices.update).toHaveBeenCalledTimes(1);
  });

  it("shows a hint instead of the control when no environment is selected", () => {
    renderForm({ environmentId: "", serviceEnvId: null });
    expect(
      screen.getByText(/select an environment above/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /enabled/i }),
    ).not.toBeInTheDocument();
  });
});

// Bug B3 (RAPPORT_DEPLOIEMENT_REEL.md): the branch list used to be fetched
// with only the projectId, so a second service configured in the same
// project could silently show the FIRST service's branches/cache entry.
// Confirms this form passes its OWN service.id through to the shared hook.
describe("ServiceConfigForm — passes its own serviceId to useProjectBranches (Bug B3)", () => {
  it("calls useProjectBranches with this service's id, not just the projectId", () => {
    mockedProjects.getSourceProviders.mockResolvedValue([] as never);
    mockedBranches.mockReturnValue({ data: [], isLoading: false } as never);

    renderForm();

    expect(mockedBranches).toHaveBeenCalledWith("p1", true, "svc1");
  });
});

// Monorepo (rootDir) + build-time variables (buildArgs): the engine already
// supported both end to end (create-service.dto.ts, local-build.service.ts) —
// this only exposes them in the form. Locks the payload wiring so a future
// refactor can't silently drop them again.
describe("ServiceConfigForm — root directory + build-time variables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnvironments.getServiceLink.mockResolvedValue({
      autoDeploy: false,
      autoBranch: "main",
    } as never);
    mockedProjects.getSourceProviders.mockResolvedValue([] as never);
    mockedBranches.mockReturnValue({ data: [], isLoading: false } as never);
  });

  it("pre-fills the root directory field from the service", async () => {
    renderForm({ service: { ...service, rootDir: "apps/web" } });
    const field = await screen.findByLabelText(/root directory/i);
    expect((field as HTMLInputElement).value).toBe("apps/web");
  });

  it("leaves the root directory field empty when the service is at repo root", async () => {
    renderForm({ service: { ...service, rootDir: "/" } });
    const field = await screen.findByLabelText(/root directory/i);
    expect((field as HTMLInputElement).value).toBe("");
  });

  it("sends the edited root directory in the update payload", async () => {
    renderForm();
    const field = await screen.findByLabelText(/root directory/i);
    fireEvent.change(field, { target: { value: "apps/web" } });
    fireEvent.click(screen.getByRole("button", { name: /save configuration/i }));

    await waitFor(() => expect(mockedServices.update).toHaveBeenCalledTimes(1));
    const [, , payload] = mockedServices.update.mock.calls[0];
    expect(payload).toMatchObject({ rootDir: "apps/web" });
  });

  it("pre-fills existing build-time variables as editable rows", async () => {
    renderForm({
      service: {
        ...service,
        buildArgs: { NEXT_PUBLIC_API_URL: "https://api.example.com" },
      },
    });
    expect(
      await screen.findByDisplayValue("NEXT_PUBLIC_API_URL"),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://api.example.com"),
    ).toBeInTheDocument();
  });

  it("adds a new build-time variable row and sends it in the payload", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: /add variable/i }));

    const [keyInput, valueInput] = screen.getAllByPlaceholderText(
      /NEXT_PUBLIC_API_URL|https:\/\/api\./,
    );
    fireEvent.change(keyInput, { target: { value: "NEXT_PUBLIC_FLAG" } });
    fireEvent.change(valueInput, { target: { value: "on" } });
    fireEvent.click(screen.getByRole("button", { name: /save configuration/i }));

    await waitFor(() => expect(mockedServices.update).toHaveBeenCalledTimes(1));
    const [, , payload] = mockedServices.update.mock.calls[0];
    expect(payload).toMatchObject({
      buildArgs: { NEXT_PUBLIC_FLAG: "on" },
    });
  });

  it("removing a variable row drops it from the saved payload", async () => {
    renderForm({
      service: {
        ...service,
        buildArgs: { NEXT_PUBLIC_API_URL: "https://api.example.com" },
      },
    });
    await screen.findByDisplayValue("NEXT_PUBLIC_API_URL");
    fireEvent.click(screen.getByRole("button", { name: /remove variable/i }));
    fireEvent.click(screen.getByRole("button", { name: /save configuration/i }));

    await waitFor(() => expect(mockedServices.update).toHaveBeenCalledTimes(1));
    const [, , payload] = mockedServices.update.mock.calls[0];
    expect(payload).toMatchObject({ buildArgs: {} });
  });

  it("flags a malformed variable key without blocking the field", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: /add variable/i }));
    const [keyInput] = screen.getAllByPlaceholderText(/NEXT_PUBLIC_API_URL/);
    fireEvent.change(keyInput, { target: { value: "FOO BAR" } });
    expect(
      await screen.findByText(/must be letters, digits, underscore only/i),
    ).toBeInTheDocument();
  });

  it("shows a Registry-mode notice that build-time variables are ignored", async () => {
    renderForm({ service: { ...service, buildMode: "REGISTRY" } });
    expect(
      await screen.findByText(/ignored in registry mode/i),
    ).toBeInTheDocument();
  });

  it("does not show root directory or build-time variables for an external image service", () => {
    renderForm({
      service: {
        ...service,
        sourceType: "DOCKER_IMAGE",
        repoPath: "nginx:latest",
      },
    });
    expect(screen.queryByLabelText(/root directory/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/build-time variables/i)).not.toBeInTheDocument();
  });
});
