'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ServerPreparationLog } from '@/types/server';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL;

type UsePreparationLogStreamOptions = {
  preparationId: string | null;
  onLog: (log: ServerPreparationLog) => void;
  onStatus?: (status: string) => void;
  onFinished?: (payload: { status: string; errorMessage?: string | null }) => void;
};

export function usePreparationLogStream({
  preparationId,
  onLog,
  onStatus,
  onFinished,
}: UsePreparationLogStreamOptions) {
  useEffect(() => {
    if (!preparationId || !SOCKET_URL) {
      return;
    }

    const socket: Socket = io(`${SOCKET_URL}/server-preparations`, {
      autoConnect: true,
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      socket.emit('join:preparation', { preparationId });
    });

    socket.on('preparation:log', (log: ServerPreparationLog) => onLog(log));
    socket.on('preparation:status', (payload: { status: string }) => {
      onStatus?.(payload.status);
    });
    socket.on(
      'preparation:finished',
      (payload: { status: string; errorMessage?: string | null }) => {
        onFinished?.(payload);
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [onFinished, onLog, onStatus, preparationId]);
}
