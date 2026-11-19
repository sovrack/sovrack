"use client";

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
 *
 * Each live-stream hook opens its own namespaced `io()` connection from this
 * base URL (see use-deployment-socket / use-automation-log-stream / …).
 */
export function resolveWsBaseUrl(): string | null {
  if (!SOCKET_URL) return null;
  if (typeof window === "undefined") return SOCKET_URL;
  try {
    const url = new URL(SOCKET_URL);
    url.hostname = window.location.hostname;
    return url.origin;
  } catch {
    return SOCKET_URL;
  }
}
