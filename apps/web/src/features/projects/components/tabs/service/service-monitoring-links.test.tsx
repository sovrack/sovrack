import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ServiceMonitoringLinks } from "./service-monitoring-links";
import { monitoringService } from "@/features/monitoring";

vi.mock("@/features/monitoring", () => ({
  monitoringService: {
    getServiceMonitoringLinks: vi.fn(),
  },
}));

const mocked = vi.mocked(monitoringService);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// B5 : liens monitoring par serveur dans l'onglet Monitoring du service.
describe("ServiceMonitoringLinks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing without a serviceEnvId", () => {
    const { container } = render(<ServiceMonitoringLinks serviceEnvId={null} />, {
      wrapper,
    });
    expect(container).toBeEmptyDOMElement();
    expect(mocked.getServiceMonitoringLinks).not.toHaveBeenCalled();
  });

  it("shows Grafana/Prometheus/Loki links when the stack is installed", async () => {
    mocked.getServiceMonitoringLinks.mockResolvedValue({
      installed: true,
      source: "server",
      serverHost: "10.1.2.3",
      grafanaUrl: "http://10.1.2.3:3000",
      prometheusUrl: "http://10.1.2.3:9090",
      lokiUrl: "http://10.1.2.3:3100",
    });
    render(<ServiceMonitoringLinks serviceEnvId="se1" />, { wrapper });

    const grafana = await screen.findByRole("link", { name: /Open Grafana/ });
    expect(grafana).toHaveAttribute("href", "http://10.1.2.3:3000");
    expect(screen.getByRole("link", { name: /Prometheus/ })).toHaveAttribute(
      "href",
      "http://10.1.2.3:9090",
    );
    expect(screen.getByRole("link", { name: /Loki/ })).toHaveAttribute(
      "href",
      "http://10.1.2.3:3100",
    );
    expect(screen.getByText(/10\.1\.2\.3/)).toBeInTheDocument();
  });

  it("guides to Setup Monitoring when the stack is not installed", async () => {
    mocked.getServiceMonitoringLinks.mockResolvedValue({
      installed: false,
      source: null,
      serverHost: "10.0.0.9",
      grafanaUrl: null,
      prometheusUrl: null,
      lokiUrl: null,
    });
    render(<ServiceMonitoringLinks serviceEnvId="se1" />, { wrapper });

    await waitFor(() =>
      expect(
        screen.getByText(/Monitoring stack not installed/),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
