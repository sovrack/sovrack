"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { resolveWsBaseUrl } from "@/shared/lib/socket";
import type { ServerSetupLog } from "@/features/servers/types/server";

type UseSetupLogStreamOptions = {
  setupId: string | null;
  onLog: (log: ServerSetupLog) => void;
  onStatus?: (status: string) => void;
  onFinished?: (payload: {
    status: string;
    errorMessage?: string | null;
  }) => void;
};

export function useSetupLogStream({
  setupId,
  onLog: onLogProp,
  onStatus: onStatusProp,
  onFinished: onFinishedProp,
}: UseSetupLogStreamOptions) {
  useEffect(() => {
    const wsBase = resolveWsBaseUrl();
    if (!setupId || !wsBase) {
      return;
    }

    const socket: Socket = io(`${wsBase}/server-setups`, {
      autoConnect: true,
      transports: ["websocket"],
      withCredentials: true,
    });

    const onConnect = () => {
      socket.emit("join:setup", { setupId });
    };
    const onLog = (log: ServerSetupLog) => onLogProp(log);
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
    socket.on("setup:log", onLog);
    socket.on("setup:status", onStatus);
    socket.on("setup:finished", onFinished);

    return () => {
      socket.off("connect", onConnect);
      socket.off("setup:log", onLog);
      socket.off("setup:status", onStatus);
      socket.off("setup:finished", onFinished);
      socket.disconnect();
    };
  }, [onFinishedProp, onLogProp, onStatusProp, setupId]);
}
