"use client";

import {
  Activity,
  BarChart3,
  MoreHorizontal,
  ScrollText,
  Wrench,
} from "lucide-react";
import { DropdownMenu, DropdownItem } from "@/shared/ui/dropdown-menu";
import type { MonitoredServer } from "@/features/monitoring/types/monitoring";

type ServerMonitoringActionsMenuProps = {
  server: MonitoredServer;
  disabled?: boolean;
  onOpenGrafana?: () => void;
  onOpenPrometheus?: () => void;
  onOpenLoki?: () => void;
  onSetupMonitoring?: () => void;
};

/**
 * Actions menu for monitoring page - only monitoring-specific actions
 */
export function ServerMonitoringActionsMenu({
  server,
  disabled,
  onOpenGrafana,
  onOpenPrometheus,
  onOpenLoki,
  onSetupMonitoring,
}: ServerMonitoringActionsMenuProps) {
  const hasMonitoring = Boolean(server.links);

  return (
    <DropdownMenu
      disabled={disabled}
      label={`Actions for ${server.name}`}
      trigger={() => (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]">
          <MoreHorizontal size={15} />
        </span>
      )}
    >
      {({ close }) => (
        <>
          {/* Monitoring Actions */}
          {hasMonitoring ? (
            <>
              <DropdownItem
                icon={<BarChart3 size={14} />}
                onClick={() => {
                  close();
                  onOpenGrafana?.();
                }}
              >
                Open Grafana
              </DropdownItem>
              <DropdownItem
                icon={<Activity size={14} />}
                onClick={() => {
                  close();
                  onOpenPrometheus?.();
                }}
              >
                Open Prometheus
              </DropdownItem>
              <DropdownItem
                icon={<ScrollText size={14} />}
                onClick={() => {
                  close();
                  onOpenLoki?.();
                }}
              >
                Open Loki
              </DropdownItem>
            </>
          ) : (
            <DropdownItem
              icon={<Wrench size={14} />}
              onClick={() => {
                close();
                onSetupMonitoring?.();
              }}
            >
              Setup Monitoring
            </DropdownItem>
          )}
        </>
      )}
    </DropdownMenu>
  );
}
