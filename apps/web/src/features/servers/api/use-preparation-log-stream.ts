"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { resolveWsBaseUrl } from "@/shared/lib/socket";
import type { ServerPreparationLog } from "@/features/servers/types/server";

type UsePreparationLogStreamOptions = {
  preparationId: string | null;
  onLog: (log: ServerPreparationLog) => void;
  onStatus?: (status: string) => void;
  onFinished?: (payload: {
    status: string;
    errorMessage?: string | null;
  }) => void;
};

export function usePreparationLogStream({
  preparationId,
  onLog: onLogProp,
  onStatus: onStatusProp,
  onFinished: onFinishedProp,
}: UsePreparationLogStreamOptions) {
  useEffect(() => {
    const wsBase = resolveWsBaseUrl();
    if (!preparationId || !wsBase) {
      return;
    }

    const socket: Socket = io(`${wsBase}/server-preparations`, {
      autoConnect: true,
      transports: ["websocket"],
      withCredentials: true,
    });

    const onConnect = () => {
      socket.emit("join:preparation", { preparationId });
    };
    const onLog = (log: ServerPreparationLog) => onLogProp(log);
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
    socket.on("preparation:log", onLog);
    socket.on("preparation:status", onStatus);
    socket.on("preparation:finished", onFinished);

    return () => {
      socket.off("connect", onConnect);
      socket.off("preparation:log", onLog);
      socket.off("preparation:status", onStatus);
      socket.off("preparation:finished", onFinished);
      socket.disconnect();
    };
  }, [onFinishedProp, onLogProp, onStatusProp, preparationId]);
}
