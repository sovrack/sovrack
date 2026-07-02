"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { resolveWsBaseUrl } from "@/shared/lib/socket";
import type { AutomationRunLog } from "@/features/automation/types/automation";

type UseAutomationLogStreamOptions = {
  runId: string | null;
  onLog: (log: AutomationRunLog) => void;
  onStatus?: (status: string) => void;
  onFinished?: (payload: {
    status: string;
    errorMessage?: string | null;
  }) => void;
};

export function useAutomationLogStream({
  runId,
  onLog: onLogProp,
  onStatus: onStatusProp,
  onFinished: onFinishedProp,
}: UseAutomationLogStreamOptions) {
  useEffect(() => {
    const wsBase = resolveWsBaseUrl();
    if (!runId || !wsBase) {
      return;
    }

    const socket: Socket = io(`${wsBase}/automation`, {
      autoConnect: true,
      transports: ["websocket"],
      withCredentials: true,
    });

    const onConnect = () => {
      socket.emit("join:automation-run", { runId });
    };
    const onLog = (log: AutomationRunLog) => onLogProp(log);
    const onStatus = (payload: { status: string }) => {
      onStatusProp?.(payload.status);
    };
    const onFinished = (payload: {
      status: string;
      errorMessage?: string | null;
    }) => {
      onFinishedProp?.(payload);
    };

    socket.on("connect", onConnect);
    socket.on("automation:log", onLog);
    socket.on("automation:status", onStatus);
    socket.on("automation:finished", onFinished);

    return () => {
      socket.off("connect", onConnect);
      socket.off("automation:log", onLog);
      socket.off("automation:status", onStatus);
      socket.off("automation:finished", onFinished);
      socket.disconnect();
    };
  }, [onFinishedProp, onLogProp, onStatusProp, runId]);
}
