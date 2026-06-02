'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { AutomationRunLog } from '@/types/automation';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL;

type UseAutomationLogStreamOptions = {
  runId: string | null;
  onLog: (log: AutomationRunLog) => void;
  onStatus?: (status: string) => void;
  onFinished?: (payload: { status: string; errorMessage?: string | null }) => void;
};

export function useAutomationLogStream({
  runId,
  onLog,
  onStatus,
  onFinished,
}: UseAutomationLogStreamOptions) {
  useEffect(() => {
    if (!runId || !SOCKET_URL) {
      return;
    }

    const socket: Socket = io(`${SOCKET_URL}/automation`, {
      autoConnect: true,
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      socket.emit('join:automation-run', { runId });
    });

    socket.on('automation:log', (log: AutomationRunLog) => onLog(log));
    socket.on('automation:status', (payload: { status: string }) => {
      onStatus?.(payload.status);
    });
    socket.on(
      'automation:finished',
      (payload: { status: string; errorMessage?: string | null }) => {
        onFinished?.(payload);
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [onFinished, onLog, onStatus, runId]);
}
