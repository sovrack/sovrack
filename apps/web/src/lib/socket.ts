'use client';

import { io, type Socket } from 'socket.io-client';
import { getToken } from './auth';

let socketInstance: Socket | null = null;

const SOCKET_URL =
  process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL;

// Initialise une seule connexion Socket.IO côté client.
// Le token JWT est transmis dans l'option auth pour authentification WebSocket.
export function getSocket(): Socket {
  if (!SOCKET_URL) {
    throw new Error(
      'NEXT_PUBLIC_WS_URL est absente. Configure-la dans .env.local.',
    );
  }

  if (!socketInstance) {
    // Lecture du token au moment de la création du socket (après login).
    const token = getToken() ?? '';
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket'],
      auth: { token },
    });
  }

  return socketInstance;
}

export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
