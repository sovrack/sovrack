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
  onLog,
  onStatus,
  onFinished,
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

    socket.on("connect", () => {
      socket.emit("join:preparation", { preparationId });
    });

    socket.on("preparation:log", (log: ServerPreparationLog) => onLog(log));
    socket.on("preparation:status", (payload: { status: string }) => {
      onStatus?.(payload.status);
    });
    socket.on(
      "preparation:finished",
      (payload: { status: string; errorMessage?: string | null }) => {
        onFinished?.(payload);
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [onFinished, onLog, onStatus, preparationId]);
}
