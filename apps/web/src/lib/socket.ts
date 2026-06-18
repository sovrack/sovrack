'use client';

import { io, type Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

const SOCKET_URL =
  process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL;

/**
 * Base URL for WebSocket namespace connections. Keeps the configured protocol +
 * port (NEXT_PUBLIC_WS_URL) but swaps the HOST for the current page's hostname,
 * so the socket is *same-site* as the page and the browser sends the httpOnly
 * auth cookie on the handshake.
 *
 * Without this, opening the app via a LAN IP (e.g. http://192.168.1.11:3000)
 * while NEXT_PUBLIC_WS_URL points at http://localhost:3001 makes every WS
 * connection cross-site → the SameSite=Lax auth cookie is dropped → the gateway
 * rejects the socket ("token absent") and live logs never stream.
 */
export function resolveWsBaseUrl(): string | null {
  if (!SOCKET_URL) return null;
  if (typeof window === 'undefined') return SOCKET_URL;
  try {
    const url = new URL(SOCKET_URL);
    url.hostname = window.location.hostname;
    return url.origin;
  } catch {
    return SOCKET_URL;
  }
}

export function getSocket(): Socket {
  if (!SOCKET_URL) {
    throw new Error('NEXT_PUBLIC_WS_URL est absente. Configure-la dans .env.local.');
  }

  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      // Transports ordered by preference: try WebSocket first, fall back to
      // long-polling HTTP if the deployment sits behind a proxy that strips
      // the Upgrade header (common behind nginx without proper forwarding).
      // Socket.IO handles the fallback automatically when the WS handshake
      // fails or times out (default upgrade timeout: 10s).
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
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
