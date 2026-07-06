import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ServerMonitoringActionsMenu } from "./server-monitoring-actions-menu";
import type { MonitoredServer } from "@/features/monitoring/types/monitoring";

function makeServer(links: MonitoredServer["links"] = null): MonitoredServer {
  return {
    serverId: "s1",
    name: "vps-prod",
    host: "10.0.0.1",
    platformStatus: "ACTIVE",
    monitoringStatus: "UNKNOWN",
    monitoringInstalledAt: links ? "2026-07-06T00:00:00Z" : null,
    links,
    lastCheckAt: null,
    metrics: {
      up: null,
      cpuPercent: null,
      memoryPercent: null,
      diskPercent: null,
      networkRxBytesPerSec: null,
    },
  } as MonitoredServer;
}

describe("ServerMonitoringActionsMenu", () => {
  it("offers Grafana/Prometheus/Loki + View Details when the stack is installed", () => {
    render(
      <ServerMonitoringActionsMenu
        server={makeServer({
          grafanaUrl: "http://10.0.0.1:3000",
          prometheusUrl: "http://10.0.0.1:9090",
          lokiUrl: "http://10.0.0.1:3100",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));

    expect(screen.getByText("Open Grafana")).toBeInTheDocument();
    expect(screen.getByText("Open Prometheus")).toBeInTheDocument();
    expect(screen.getByText("Open Loki")).toBeInTheDocument();
    expect(screen.getByText("View Details")).toBeInTheDocument();
    expect(screen.queryByText("Setup Monitoring")).not.toBeInTheDocument();
  });

  it("offers only Setup Monitoring + View Details when the stack is not installed", () => {
    render(<ServerMonitoringActionsMenu server={makeServer(null)} />);
    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));

    expect(screen.getByText("Setup Monitoring")).toBeInTheDocument();
    expect(screen.getByText("View Details")).toBeInTheDocument();
    expect(screen.queryByText("Open Grafana")).not.toBeInTheDocument();
  });

  it("calls onOpenGrafana / onOpenPrometheus / onOpenLoki when clicked", () => {
    const onOpenGrafana = vi.fn();
    const onOpenPrometheus = vi.fn();
    const onOpenLoki = vi.fn();
    render(
      <ServerMonitoringActionsMenu
        server={makeServer({
          grafanaUrl: "http://10.0.0.1:3000",
          prometheusUrl: "http://10.0.0.1:9090",
          lokiUrl: "http://10.0.0.1:3100",
        })}
        onOpenGrafana={onOpenGrafana}
        onOpenPrometheus={onOpenPrometheus}
        onOpenLoki={onOpenLoki}
      />,
    );

    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("Open Grafana"));
    expect(onOpenGrafana).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("Open Prometheus"));
    expect(onOpenPrometheus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("Open Loki"));
    expect(onOpenLoki).toHaveBeenCalledTimes(1);
  });

  it("calls onSetupMonitoring when the stack is not installed", () => {
    const onSetupMonitoring = vi.fn();
    render(
      <ServerMonitoringActionsMenu
        server={makeServer(null)}
        onSetupMonitoring={onSetupMonitoring}
      />,
    );
    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("Setup Monitoring"));
    expect(onSetupMonitoring).toHaveBeenCalledTimes(1);
  });

  it("calls onViewDetails when clicked", () => {
    const onViewDetails = vi.fn();
    render(
      <ServerMonitoringActionsMenu
        server={makeServer(null)}
        onViewDetails={onViewDetails}
      />,
    );
    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("View Details"));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });
});
