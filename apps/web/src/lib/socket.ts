'use client';

import { io, type Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

const SOCKET_URL =
  process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL;

export function getSocket(): Socket {
  if (!SOCKET_URL) {
    throw new Error('NEXT_PUBLIC_WS_URL est absente. Configure-la dans .env.local.');
  }

  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket'],
      withCredentials: true,
    });
  }

  return socketInstance;
}

export function resetSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

export function disconnectSocket(): void {
  resetSocket();
}
