import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ServiceCredentials } from "./service-credentials";
import { useServiceCredentials } from "@/features/projects/api/use-service-credentials";
import { servicesService } from "@/features/projects/api/services.service";
import type { ServiceCredentials as Creds } from "@/features/projects/types/service";

vi.mock("@/features/projects/api/use-service-credentials", () => ({
  useServiceCredentials: vi.fn(),
}));
vi.mock("@/features/projects/api/services.service", () => ({
  servicesService: { update: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/shared/contexts/toast-context", () => ({
  useToast: () => vi.fn(),
}));

const mockedHook = vi.mocked(useServiceCredentials);
const mockedServices = vi.mocked(servicesService);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const pgCreds: Creds = {
  serviceId: "s1",
  databaseType: "POSTGRES",
  internal: {
    user: "appuser",
    dbName: "core",
    password: "pgpass",
    rootPassword: null,
    host: "my-postgres",
    port: 5432,
    connectionUrlEnvKey: "DATABASE_URL",
    connectionUrl: "postgresql://appuser:pgpass@my-postgres:5432/core",
  },
  external: { enabled: false, port: null },
};

function mockData(over: Partial<Creds> = {}) {
  mockedHook.mockReturnValue({
    data: { ...pgCreds, ...over },
    isLoading: false,
    error: null,
  } as never);
}

describe("ServiceCredentials (Task 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders the internal fields (user, db name, host, internal port)", () => {
    mockData();
    render(
      <ServiceCredentials projectId="p1" serviceId="s1" active />,
      { wrapper },
    );
    expect(screen.getByText("appuser")).toBeInTheDocument();
    expect(screen.getByText("core")).toBeInTheDocument();
    expect(screen.getByText("my-postgres")).toBeInTheDocument();
    expect(screen.getByText("5432")).toBeInTheDocument();
  });

  it("shows the explicit external-exposure warning", () => {
    mockData();
    render(
      <ServiceCredentials projectId="p1" serviceId="s1" active />,
      { wrapper },
    );
    expect(
      screen.getByText(/Not required for other services in this project/i),
    ).toBeInTheDocument();
  });

  it("does not render a Root password field for Postgres (no distinct root)", () => {
    mockData();
    render(
      <ServiceCredentials projectId="p1" serviceId="s1" active />,
      { wrapper },
    );
    expect(screen.queryByText("Root password")).not.toBeInTheDocument();
  });

  it("renders a Root password field for MySQL", () => {
    mockData({
      databaseType: "MYSQL",
      internal: { ...pgCreds.internal, rootPassword: "rootpw", port: 3306 },
    });
    render(
      <ServiceCredentials projectId="p1" serviceId="s1" active />,
      { wrapper },
    );
    expect(screen.getByText("Root password")).toBeInTheDocument();
  });

  it("persists externalPort when enabling external access", async () => {
    mockData();
    render(
      <ServiceCredentials projectId="p1" serviceId="s1" active />,
      { wrapper },
    );
    // Enable the checkbox → port input appears, defaulting to the engine port.
    fireEvent.click(
      screen.getByLabelText(/Expose this database on a host port/i),
    );
    fireEvent.click(screen.getByText("Save external access"));
    await waitFor(() =>
      expect(mockedServices.update).toHaveBeenCalledWith("p1", "s1", {
        externalPort: 5432,
      }),
    );
  });

  it("clears externalPort (null) when external access stays disabled", async () => {
    mockData({ external: { enabled: true, port: 5433 } });
    render(
      <ServiceCredentials projectId="p1" serviceId="s1" active />,
      { wrapper },
    );
    // Turn the (initially enabled) exposure off, then save.
    fireEvent.click(
      screen.getByLabelText(/Expose this database on a host port/i),
    );
    fireEvent.click(screen.getByText("Save external access"));
    await waitFor(() =>
      expect(mockedServices.update).toHaveBeenCalledWith("p1", "s1", {
        externalPort: null,
      }),
    );
  });
});
