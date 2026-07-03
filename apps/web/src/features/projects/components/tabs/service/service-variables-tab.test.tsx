import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ServiceVariablesTab } from "./service-variables-tab";
import { environmentsService } from "@/features/projects/api/environments.service";

vi.mock("@/features/projects/api/environments.service", () => ({
  environmentsService: {
    getServiceLink: vi.fn(),
    updateServiceLink: vi.fn(),
    linkService: vi.fn(),
    getServiceLinks: vi.fn(),
  },
}));

const mocked = vi.mocked(environmentsService);

const baseLink = {
  id: "senv1",
  serviceId: "svc1",
  environmentId: "env1",
  env: null,
  autoDeploy: false,
  autoBranch: "main",
  branch: null,
  port: null,
  startCommand: null,
  healthcheckPath: null,
  buildPack: null,
  service: {
    id: "svc1",
    name: "app",
    type: "APPLICATION",
    branch: "develop",
    port: 3000,
    startCommand: "npm start",
    healthcheckPath: "/health",
    buildPack: "DOCKERFILE",
  },
  environment: { id: "env1", name: "PRODUCTION" },
  createdAt: "",
  updatedAt: "",
};

function renderTab() {
  return render(
    <ServiceVariablesTab
      projectId="p1"
      serviceId="svc1"
      environmentId="env1"
      serviceEnvId="senv1"
    />,
  );
}

// B4: this tab replaces the old "Environments" list (PRODUCTION/STAGING rows
// with a chevron per row to expand its own editor) — the editor now shows
// DIRECTLY for whichever environment the page header's selector points at.

// "Correction rapide" mission, Task 1: the 5 per-environment build overrides
// (branch/port/startCommand/healthcheckPath/buildPack) were removed from this
// tab — Build is a single, shared property of the Service (edited in its own
// Build/General tab), not something that varies per environment. These tests
// replace the old C6 "override fields" coverage: they now assert the fields
// are ABSENT and that saving no longer sends them.
describe("ServiceVariablesTab — no per-environment build overrides (Task 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getServiceLink.mockResolvedValue(baseLink as never);
    mocked.updateServiceLink.mockResolvedValue(undefined);
  });

  it("shows the editor directly, with no intermediate click required", async () => {
    renderTab();
    await waitFor(() => expect(mocked.getServiceLink).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /variables/i })).toBeNull();
  });

  it("does not render the removed 'overrides for this environment' fields", async () => {
    renderTab();
    await waitFor(() => expect(mocked.getServiceLink).toHaveBeenCalled());
    expect(
      screen.queryByText(/overrides for this environment/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("develop")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("3000")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("npm start")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("/health")).not.toBeInTheDocument();
    expect(screen.queryByText(/build pack/i)).not.toBeInTheDocument();
  });

  it("saves without sending branch/port/startCommand/healthcheckPath/buildPack", async () => {
    renderTab();
    await waitFor(() =>
      expect(screen.getByText(/^save$/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText(/^save$/i));

    await waitFor(() => expect(mocked.updateServiceLink).toHaveBeenCalled());
    const payload = mocked.updateServiceLink.mock.calls[0][2];
    expect(payload).not.toHaveProperty("branch");
    expect(payload).not.toHaveProperty("port");
    expect(payload).not.toHaveProperty("startCommand");
    expect(payload).not.toHaveProperty("healthcheckPath");
    expect(payload).not.toHaveProperty("buildPack");
  });

  // "Correction rapide" (new mission), Task 1: Auto-deploy on push has since
  // moved to the General/Build tab, next to Deployment trigger (confirmed a
  // DISTINCT setting from Service.deployTrigger, not a duplicate — see
  // service-config-form.test.tsx). This tab no longer shows or saves it.
  it("no longer shows or sends the auto-deploy toggle (moved to General)", async () => {
    renderTab();
    await waitFor(() =>
      expect(screen.getByText(/^save$/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByLabelText(/auto-deploy on push/i),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/^save$/i));

    await waitFor(() => expect(mocked.updateServiceLink).toHaveBeenCalled());
    const payload = mocked.updateServiceLink.mock.calls[0][2];
    expect(payload).not.toHaveProperty("autoDeploy");
    expect(payload).not.toHaveProperty("autoBranch");
  });
});

describe("ServiceVariablesTab — .env-format Variables editor (C7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getServiceLink.mockResolvedValue({
      ...baseLink,
      env: '{"NODE_ENV":"production","DEBUG":"false"}',
    } as never);
    mocked.updateServiceLink.mockResolvedValue(undefined);
  });

  it("loads existing variables pre-formatted as NAME=value lines", async () => {
    renderTab();
    const textarea = await screen.findByPlaceholderText(/NAME=value/);
    await waitFor(() =>
      expect((textarea as HTMLTextAreaElement).value).toBe(
        "NODE_ENV=production\nDEBUG=false",
      ),
    );
  });

  it("saves well-formed lines as JSON, ignoring a malformed line without blocking the save", async () => {
    renderTab();
    const textarea = await screen.findByPlaceholderText(/NAME=value/);
    fireEvent.change(textarea, {
      target: {
        value: "NODE_ENV=production\nthis line has no equals sign\nPORT=4000",
      },
    });

    expect(screen.getByText(/line 2 doesn't match/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/^save$/i));

    await waitFor(() =>
      expect(mocked.updateServiceLink).toHaveBeenCalledWith(
        "p1",
        "senv1",
        expect.objectContaining({
          env: JSON.stringify({ NODE_ENV: "production", PORT: "4000" }),
        }),
      ),
    );
  });

  it("ignores blank lines without flagging them as errors", async () => {
    renderTab();
    const textarea = await screen.findByPlaceholderText(/NAME=value/);
    fireEvent.change(textarea, {
      target: { value: "NODE_ENV=production\n\nPORT=4000" },
    });
    expect(screen.queryByText(/doesn't match/i)).not.toBeInTheDocument();
  });
});

// B4: functionality that must survive the removal of the old list-based tab.
describe("ServiceVariablesTab — preserved edge cases from the old tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a link to the project's Environments tab when no environment exists at all", () => {
    render(
      <ServiceVariablesTab
        projectId="p1"
        serviceId="svc1"
        environmentId=""
        serviceEnvId={null}
      />,
    );
    const link = screen.getByRole("link", { name: /environments/i });
    expect(link).toHaveAttribute("href", "/projects/p1?openEnvironments=true");
  });

  it("auto-creates the missing service↔environment link on the fly (legacy service safety net)", async () => {
    mocked.linkService.mockResolvedValue(undefined as never);
    mocked.getServiceLinks.mockResolvedValue([
      { id: "senv-new", serviceId: "svc1", environmentId: "env1" },
    ] as never);
    mocked.getServiceLink.mockResolvedValue(baseLink as never);

    render(
      <ServiceVariablesTab
        projectId="p1"
        serviceId="svc1"
        environmentId="env1"
        serviceEnvId={null}
      />,
    );

    await waitFor(() =>
      expect(mocked.linkService).toHaveBeenCalledWith("p1", "env1", "svc1"),
    );
    await waitFor(() =>
      expect(mocked.getServiceLink).toHaveBeenCalledWith("p1", "senv-new"),
    );
  });
});
