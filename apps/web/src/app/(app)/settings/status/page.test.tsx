import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import SystemStatusPage from "./page";
import { healthService } from "@/features/monitoring/api/health.service";

vi.mock("@/features/monitoring/api/health.service", () => ({
  healthService: { get: vi.fn() },
}));

const mocked = vi.mocked(healthService);

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

// C1: this page must report only the PRODUCT's own health (backend API,
// database, deployment queue, webhook config) — the per-VPS observability
// block (Prometheus/Grafana/monitored servers) previously shown here is
// removed; that install flow already lives at /automation.
describe("SystemStatusPage (Task C1)", () => {
  it("shows Core services but no Observability stack section", async () => {
    mocked.get.mockResolvedValue({
      status: "ok",
      timestamp: "",
      uptime: 120,
      version: "1.0.0",
      database: "connected",
      redis: "connected",
      webhook: {
        autoConfigure: false,
        configured: false,
        valid: true,
        callbackUrl: null,
      },
    });

    render(<SystemStatusPage />, { wrapper: setup() });

    await waitFor(() =>
      expect(screen.getByText("Backend API")).toBeInTheDocument(),
    );
    expect(screen.getByText("Database (PostgreSQL)")).toBeInTheDocument();
    expect(screen.getByText("Deployment queue (Redis)")).toBeInTheDocument();

    expect(screen.queryByText("Observability stack")).not.toBeInTheDocument();
    expect(screen.queryByText("Prometheus")).not.toBeInTheDocument();
    expect(screen.queryByText("Grafana")).not.toBeInTheDocument();
    expect(screen.queryByText("Monitored servers")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/installer le monitoring/i),
    ).not.toBeInTheDocument();
  });

  it("still reflects a real disconnected component (e.g. Redis down)", async () => {
    mocked.get.mockResolvedValue({
      status: "ok",
      timestamp: "",
      uptime: 10,
      version: "1.0.0",
      database: "connected",
      redis: "disconnected",
      webhook: {
        autoConfigure: false,
        configured: false,
        valid: true,
        callbackUrl: null,
      },
    });

    render(<SystemStatusPage />, { wrapper: setup() });

    await waitFor(() =>
      expect(screen.getByText("Disconnected")).toBeInTheDocument(),
    );
  });
});
