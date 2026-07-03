import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ServiceEnvironments } from "./service-environments";
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
    // Deliberately distinct from the "main" placeholder already used by the
    // unrelated auto-deploy branch field above, so placeholder lookups below
    // are unambiguous.
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

async function openEditor() {
  render(
    <ServiceEnvironments
      projectId="p1"
      serviceId="svc1"
      environments={[{ id: "env1", name: "PRODUCTION" }]}
      envLinks={[{ id: "senv1", environmentId: "env1" }]}
      onChanged={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /variables/i }));
  await waitFor(() => expect(mocked.getServiceLink).toHaveBeenCalled());
}

describe("ServiceEnvironments — the 5 override fields (C6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getServiceLink.mockResolvedValue(baseLink as never);
    mocked.updateServiceLink.mockResolvedValue(undefined);
  });

  it("shows the service's own value as a placeholder when the override is empty", async () => {
    await openEditor();
    await waitFor(() =>
      expect(screen.getByPlaceholderText("develop")).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText("3000")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("npm start")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("/health")).toBeInTheDocument();
    expect(screen.getByText(/use service default \(DOCKERFILE\)/i)).toBeInTheDocument();
  });

  it("sends explicit null for every override left empty on save", async () => {
    await openEditor();
    await waitFor(() => expect(screen.getByText(/^save$/i)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/^save$/i));

    await waitFor(() =>
      expect(mocked.updateServiceLink).toHaveBeenCalledWith(
        "p1",
        "senv1",
        expect.objectContaining({
          branch: null,
          port: null,
          startCommand: null,
          healthcheckPath: null,
          buildPack: null,
        }),
      ),
    );
  });

  it("sends the typed value when an override is filled in", async () => {
    await openEditor();
    const branchInput = await screen.findByPlaceholderText("develop");
    fireEvent.change(branchInput, { target: { value: "staging" } });
    fireEvent.change(screen.getByPlaceholderText("3000"), {
      target: { value: "4000" },
    });

    fireEvent.click(screen.getByText(/^save$/i));

    await waitFor(() =>
      expect(mocked.updateServiceLink).toHaveBeenCalledWith(
        "p1",
        "senv1",
        expect.objectContaining({ branch: "staging", port: 4000 }),
      ),
    );
  });

  it("rejects a non-numeric port before saving", async () => {
    await openEditor();
    const portInput = await screen.findByPlaceholderText("3000");
    fireEvent.change(portInput, { target: { value: "not-a-number" } });
    fireEvent.click(screen.getByText(/^save$/i));

    await waitFor(() =>
      expect(screen.getByText(/port must be a whole number/i)).toBeInTheDocument(),
    );
    expect(mocked.updateServiceLink).not.toHaveBeenCalled();
  });

  it("only offers the 4 build packs actually supported by the deploy engine", async () => {
    await openEditor();
    await waitFor(() => expect(screen.getByText(/build pack/i)).toBeInTheDocument());
    const select = screen.getByText(/build pack/i)
      .closest("div")!
      .querySelector("select")!;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(["", "DOCKERFILE", "NIXPACKS", "STATIC", "NONE"]);
  });
});

describe("ServiceEnvironments — .env-format Variables editor (C7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getServiceLink.mockResolvedValue({
      ...baseLink,
      env: '{"NODE_ENV":"production","DEBUG":"false"}',
    } as never);
    mocked.updateServiceLink.mockResolvedValue(undefined);
  });

  it("loads existing variables pre-formatted as NAME=value lines", async () => {
    await openEditor();
    const textarea = await screen.findByPlaceholderText(/NAME=value/);
    await waitFor(() =>
      expect((textarea as HTMLTextAreaElement).value).toBe(
        "NODE_ENV=production\nDEBUG=false",
      ),
    );
  });

  it("saves well-formed lines as JSON, ignoring a malformed line without blocking the save", async () => {
    await openEditor();
    const textarea = await screen.findByPlaceholderText(/NAME=value/);
    fireEvent.change(textarea, {
      target: { value: "NODE_ENV=production\nthis line has no equals sign\nPORT=4000" },
    });

    expect(
      screen.getByText(/line 2 doesn't match/i),
    ).toBeInTheDocument();

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
    await openEditor();
    const textarea = await screen.findByPlaceholderText(/NAME=value/);
    fireEvent.change(textarea, {
      target: { value: "NODE_ENV=production\n\nPORT=4000" },
    });
    expect(screen.queryByText(/doesn't match/i)).not.toBeInTheDocument();
  });
});
