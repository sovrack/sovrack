'use client';

import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/auth';
import { getSocket } from '@/lib/socket';
import type {
  DeploymentFinishedEvent,
  DeploymentLogEvent,
  DeploymentStatus,
  DeploymentStatusEvent,
  LogLevel,
  LogLine,
} from '@/types/deployment';

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

const ACTIVE_STATUSES: DeploymentStatus[] = ['PENDING', 'RUNNING'];

function isActiveStatus(status: DeploymentStatus | null): boolean {
  if (!status) {
    return false;
  }

  return ACTIVE_STATUSES.includes(status);
}

function isDeploymentStatus(value: string): value is DeploymentStatus {
  return (
    value === 'PENDING' ||
    value === 'RUNNING' ||
    value === 'SUCCESS' ||
    value === 'FAILED' ||
    value === 'CANCELED'
  );
}

function inferLogLevel(message: string): LogLevel {
  if (/error|fail|fatal|exception/i.test(message)) {
    return 'error';
  }

  if (/success|ok|done|completed|ready/i.test(message)) {
    return 'success';
  }

  return 'info';
}

function parseStaticLogs(rawLogs: string | null | undefined): LogLine[] {
  if (!rawLogs) {
    return [];
  }

  return rawLogs
    .split('\n')
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
  const [logs, setLogs] = useState<LogLine[]>(() => parseStaticLogs(initialLogs));
  const [status, setStatus] = useState<DeploymentStatus | null>(initialStatus);
  const [isConnected, setIsConnected] = useState(false);
  const previousDeploymentId = useRef<string | null>(null);

  // Réinitialise les données locales quand on change de déploiement.
  useEffect(() => {
    if (previousDeploymentId.current === deploymentId) {
      return;
    }

    previousDeploymentId.current = deploymentId;
    setLogs(parseStaticLogs(initialLogs));
    setStatus(initialStatus);
    setIsConnected(false);
  }, [deploymentId, initialLogs, initialStatus]);

  // Quand le live est désactivé, on garde uniquement la vue statique.
  useEffect(() => {
    if (enabled) {
      return;
    }

    setLogs(parseStaticLogs(initialLogs));
    setStatus(initialStatus);
    setIsConnected(false);
  }, [enabled, initialLogs, initialStatus]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const rootSocket = getSocket();
    const deploymentSocket = rootSocket.io.socket('/deployments');
    const token = getToken();

    if (token) {
      deploymentSocket.auth = { token: `Bearer ${token}` };
    }

    deploymentSocket.io.opts.reconnection = true;
    deploymentSocket.io.opts.reconnectionDelay = 1000;
    deploymentSocket.io.opts.reconnectionDelayMax = 5000;

    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onLog = (payload: DeploymentLogEvent) => {
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
      if (payload.deploymentId !== deploymentId) {
        return;
      }

      if (isDeploymentStatus(payload.status)) {
        setStatus(payload.status);
      }
    };

    const onFinished = (payload: DeploymentFinishedEvent) => {
      if (payload.deploymentId !== deploymentId) {
        return;
      }

      if (isDeploymentStatus(payload.status)) {
        setStatus(payload.status);
      }

      if (isDeploymentStatus(payload.status) && !isActiveStatus(payload.status)) {
        deploymentSocket.off('deployment:log', onLog);
        deploymentSocket.off('deployment:status', onStatus);
        deploymentSocket.off('deployment:finished', onFinished);
        deploymentSocket.disconnect();
      }
    };

    deploymentSocket.on('connect', onConnect);
    deploymentSocket.on('disconnect', onDisconnect);
    deploymentSocket.on('deployment:log', onLog);
    deploymentSocket.on('deployment:status', onStatus);
    deploymentSocket.on('deployment:finished', onFinished);

    if (!deploymentSocket.connected) {
      deploymentSocket.connect();
    } else {
      setIsConnected(true);
    }

    return () => {
      deploymentSocket.off('connect', onConnect);
      deploymentSocket.off('disconnect', onDisconnect);
      deploymentSocket.off('deployment:log', onLog);
      deploymentSocket.off('deployment:status', onStatus);
      deploymentSocket.off('deployment:finished', onFinished);
      deploymentSocket.disconnect();
      setIsConnected(false);
    };
  }, [deploymentId, enabled]);

  return { logs, status, isConnected };
}
