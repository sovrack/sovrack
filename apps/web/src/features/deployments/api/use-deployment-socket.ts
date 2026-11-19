"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { resolveWsBaseUrl } from "@/shared/lib/socket";
import type {
  DeploymentErrorEvent,
  DeploymentFinishedEvent,
  DeploymentJoinedEvent,
  DeploymentLogEvent,
  DeploymentLogReplayEvent,
  DeploymentStatus,
  DeploymentStatusEvent,
} from "@/features/deployments/types";
import type { LogLevel, LogLine } from "@/shared/types/log-line";

type UseDeploymentSocketOptions = {
  deploymentId: string;
  enabled: boolean;
  initialStatus?: DeploymentStatus | null;
  initialLogs?: string | null;
};

type UseDeploymentSocketResult = {
  logs: LogLine[];
  status: DeploymentStatus | null;
  isConnected: boolean;
};

const ACTIVE_STATUSES: DeploymentStatus[] = ["PENDING", "RUNNING"];

function isActiveStatus(status: DeploymentStatus | null): boolean {
  if (!status) {
    return false;
  }

  return ACTIVE_STATUSES.includes(status);
}

function isDeploymentStatus(value: string): value is DeploymentStatus {
  return (
    value === "PENDING" ||
    value === "RUNNING" ||
    value === "SUCCESS" ||
    value === "FAILED" ||
    value === "CANCELED"
  );
}

function inferLogLevel(message: string): LogLevel {
  if (/error|fail|fatal|exception/i.test(message)) {
    return "error";
  }

  if (/success|ok|done|completed|ready/i.test(message)) {
    return "success";
  }

  return "info";
}

function parseStaticLogs(rawLogs: string | null | undefined): LogLine[] {
  if (!rawLogs) {
    return [];
  }

  return rawLogs
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((message) => ({
      timestamp: new Date().toISOString(),
      message,
      level: inferLogLevel(message),
    }));
}

export function useDeploymentSocket({
  deploymentId,
  enabled,
  initialStatus = null,
  initialLogs = null,
}: UseDeploymentSocketOptions): UseDeploymentSocketResult {
  const [logs, setLogs] = useState<LogLine[]>(() =>
    parseStaticLogs(initialLogs),
  );
  const [status, setStatus] = useState<DeploymentStatus | null>(initialStatus);
  const [isConnected, setIsConnected] = useState(false);
  const previousDeploymentId = useRef<string | null>(null);
  const hasJoinedRoom = useRef(false);

  // Réinitialise la connexion quand on change de déploiement.
  useEffect(() => {
    if (previousDeploymentId.current === deploymentId) return;
    previousDeploymentId.current = deploymentId;
    setStatus(initialStatus);
    setIsConnected(false);
    hasJoinedRoom.current = false;
  }, [deploymentId, initialStatus]);

  // Met à jour les logs quand initialLogs arrive (fetch async post-ouverture).
  // Si le socket a déjà reçu plus de lignes, on garde les siennes.
  useEffect(() => {
    const staticLogs = parseStaticLogs(initialLogs);
    if (staticLogs.length === 0) return;
    setLogs((prev) => (prev.length >= staticLogs.length ? prev : staticLogs));
  }, [initialLogs]);

  // Quand le live est désactivé, on garde uniquement la vue statique.
  useEffect(() => {
    if (enabled) {
      return;
    }

    setLogs(parseStaticLogs(initialLogs));
    setStatus(initialStatus);
    setIsConnected(false);
    hasJoinedRoom.current = false;
  }, [enabled, initialLogs, initialStatus]);

  useEffect(() => {
    const wsBase = resolveWsBaseUrl();
    if (!enabled || !wsBase) {
      return;
    }

    // Fresh, authenticated namespace connection — mirrors the automation and
    // server-setup streams. Reusing the shared root manager
    // (`getSocket().io.socket('/deployments')`) dropped the auth cookie on the
    // `/deployments` handshake, so the gateway rejected it ("token absent") and
    // live logs never streamed. `withCredentials: true` lets the browser send
    // the httpOnly auth cookie on the handshake.
    const deploymentSocket = io(`${wsBase}/deployments`, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    const onConnect = () => {
      setIsConnected(true);
      hasJoinedRoom.current = false;
      deploymentSocket.emit("join:deployment", { deploymentId });
    };

    const onDisconnect = () => {
      setIsConnected(false);
      hasJoinedRoom.current = false;
    };

    const onJoined = (payload: DeploymentJoinedEvent) => {
      if (payload.deploymentId !== deploymentId) {
        return;
      }
      hasJoinedRoom.current = true;
      // After joining (initial connect OR reconnect), ask the gateway to
      // replay any buffered logs we may have missed during disconnection.
      deploymentSocket.emit("deployment:request-replay", { deploymentId });
    };

    const onLogReplay = (payload: DeploymentLogReplayEvent) => {
      if (!hasJoinedRoom.current) {
        return;
      }
      if (payload.deploymentId !== deploymentId) {
        return;
      }
      if (!payload.logs || payload.logs.length === 0) {
        return;
      }

      const replayedLines: LogLine[] = payload.logs
        .map((entry) => entry.message?.trim())
        .filter((message): message is string => Boolean(message))
        .map((message, index) => {
          const source = payload.logs[index];
          return {
            timestamp: source.timestamp || new Date().toISOString(),
            message,
            level: source.level ?? inferLogLevel(message),
            isReplayed: true,
          };
        });

      if (replayedLines.length === 0) {
        return;
      }

      setLogs((previous) => {
        // Dedup against any log already present (same timestamp+message).
        const existingKeys = new Set(
          previous.map((line) => `${line.timestamp}::${line.message}`),
        );
        const uniqueReplayed = replayedLines.filter(
          (line) => !existingKeys.has(`${line.timestamp}::${line.message}`),
        );
        if (uniqueReplayed.length === 0) {
          return previous;
        }
        return [...uniqueReplayed, ...previous];
      });
    };

    const onRoomError = (payload: DeploymentErrorEvent) => {
      if (payload.deploymentId && payload.deploymentId !== deploymentId) {
        return;
      }
      const message = payload.message?.trim();
      if (!message) {
        return;
      }
      setLogs((previous) => [
        ...previous,
        {
          timestamp: new Date().toISOString(),
          message,
          level: "error",
        },
      ]);
    };

    const onLog = (payload: DeploymentLogEvent) => {
      if (!hasJoinedRoom.current) {
        return;
      }
      if (payload.deploymentId !== deploymentId) {
        return;
      }

      const message = payload.message?.trim();
      if (!message) {
        return;
      }

      setLogs((previous) => [
        ...previous,
        {
          timestamp: payload.timestamp || new Date().toISOString(),
          message,
          level: payload.level ?? inferLogLevel(message),
        },
      ]);
    };

    const onStatus = (payload: DeploymentStatusEvent) => {
      if (!hasJoinedRoom.current) {
        return;
      }
      if (payload.deploymentId !== deploymentId) {
        return;
      }

      if (isDeploymentStatus(payload.status)) {
        setStatus(payload.status);
      }
    };

    const onFinished = (payload: DeploymentFinishedEvent) => {
      if (!hasJoinedRoom.current) {
        return;
      }
      if (payload.deploymentId !== deploymentId) {
        return;
      }

      if (isDeploymentStatus(payload.status)) {
        setStatus(payload.status);
      }

      if (
        isDeploymentStatus(payload.status) &&
        !isActiveStatus(payload.status)
      ) {
        deploymentSocket.off("deployment:log", onLog);
        deploymentSocket.off("deployment:log-replay", onLogReplay);
        deploymentSocket.off("deployment:status", onStatus);
        deploymentSocket.off("deployment:finished", onFinished);
        deploymentSocket.disconnect();
      }
    };

    deploymentSocket.on("connect", onConnect);
    deploymentSocket.on("disconnect", onDisconnect);
    deploymentSocket.on("deployment:joined", onJoined);
    deploymentSocket.on("deployment:error", onRoomError);
    deploymentSocket.on("deployment:log", onLog);
    deploymentSocket.on("deployment:log-replay", onLogReplay);
    deploymentSocket.on("deployment:status", onStatus);
    deploymentSocket.on("deployment:finished", onFinished);

    if (!deploymentSocket.connected) {
      deploymentSocket.connect();
    } else {
      setIsConnected(true);
      hasJoinedRoom.current = false;
      deploymentSocket.emit("join:deployment", { deploymentId });
    }

    return () => {
      deploymentSocket.off("connect", onConnect);
      deploymentSocket.off("disconnect", onDisconnect);
      deploymentSocket.off("deployment:joined", onJoined);
      deploymentSocket.off("deployment:error", onRoomError);
      deploymentSocket.off("deployment:log", onLog);
      deploymentSocket.off("deployment:log-replay", onLogReplay);
      deploymentSocket.off("deployment:status", onStatus);
      deploymentSocket.off("deployment:finished", onFinished);
      deploymentSocket.disconnect();
      setIsConnected(false);
      hasJoinedRoom.current = false;
    };
  }, [deploymentId, enabled]);

  return { logs, status, isConnected };
}
