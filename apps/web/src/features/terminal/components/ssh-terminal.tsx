"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { io, type Socket } from "socket.io-client";
import api from "@/shared/lib/api";
import { resolveWsBaseUrl } from "@/shared/lib/socket";
import "@xterm/xterm/css/xterm.css";

type Props = {
  serverId: string;
  onClose?: () => void;
};

type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "closed";

async function fetchWsToken(): Promise<string | null> {
  try {
    const res = await api.get<{ wsToken: string }>("/auth/ws-token");
    return res.data.wsToken;
  } catch {
    return null;
  }
}

export function SshTerminal({ serverId, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const disconnect = useCallback(() => {
    socketRef.current?.emit("terminal:disconnect");
    socketRef.current?.disconnect();
    socketRef.current = null;
    setState("closed");
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#a1a1aa",
        selectionBackground: "#3f3f46",
        black: "#18181b",
        brightBlack: "#3f3f46",
        red: "#ef4444",
        brightRed: "#f87171",
        green: "#22c55e",
        brightGreen: "#4ade80",
        yellow: "#eab308",
        brightYellow: "#facc15",
        blue: "#3b82f6",
        brightBlue: "#60a5fa",
        magenta: "#f97316",
        brightMagenta: "#fb923c",
        cyan: "#06b6d4",
        brightCyan: "#22d3ee",
        white: "#d4d4d8",
        brightWhite: "#f4f4f5",
      },
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const linksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(linksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    setState("connecting");
    term.writeln("\x1b[90mObtention du jeton WebSocket...\x1b[0m");

    const backendUrl = resolveWsBaseUrl() ?? "http://localhost:3001";

    let cancelled = false;

    void (async () => {
      const wsToken = await fetchWsToken();
      if (cancelled) return;

      if (!wsToken) {
        setState("error");
        setErrorMsg("Impossible d'obtenir le jeton WebSocket");
        term.writeln(
          "\x1b[31m✗ Unable to obtain the WebSocket token. Check your session.\x1b[0m",
        );
        return;
      }

      term.writeln("\x1b[90mConnecting via SSH...\x1b[0m");

      const socket = io(`${backendUrl}/terminal`, {
        transports: ["websocket"],
        withCredentials: true,
        auth: { token: wsToken },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        const { cols, rows } = term;
        socket.emit("terminal:connect", { serverId, cols, rows });
      });

      // Événements de reconnexion (émis par le Manager socket.io, pas le
      // socket lui-même) : affiche un état distinct "Reconnexion..." plutôt
      // que de laisser l'utilisateur croire que le terminal est figé.
      socket.io.on("reconnect_attempt", () => {
        setState("reconnecting");
        term.writeln("\r\n\x1b[33mReconnecting...\x1b[0m");
      });

      socket.io.on("reconnect", () => {
        term.writeln("\r\n\x1b[32mReconnected.\x1b[0m");
      });

      socket.io.on("reconnect_failed", () => {
        setState("error");
        setErrorMsg("Reconnection failed");
        term.writeln("\r\n\x1b[31m✗ Reconnection failed.\x1b[0m");
      });

      socket.on("terminal:ready", () => {
        setState("connected");
        term.writeln("\x1b[32mConnected.\x1b[0m\r\n");

        term.onData((data) => socket.emit("terminal:data", data));

        term.onResize(({ cols, rows }) => {
          socket.emit("terminal:resize", { cols, rows });
        });
      });

      socket.on("terminal:data", (data: string) => {
        term.write(data);
      });

      socket.on("terminal:error", (msg: string) => {
        setState("error");
        setErrorMsg(msg);
        term.writeln(`\r\n\x1b[31m✗ Error: ${msg}\x1b[0m`);
      });

      socket.on("terminal:close", ({ code }: { code: number | null }) => {
        setState("closed");
        term.writeln(
          `\r\n\x1b[90mSession closed (code: ${String(code ?? 0)}).\x1b[0m`,
        );
        socket.disconnect();
      });

      socket.on("disconnect", () => {
        term.writeln("\r\n\x1b[33mDisconnected from server.\x1b[0m");
        setState("closed");
      });

      socket.on("connect_error", (err: Error) => {
        setState("error");
        setErrorMsg(err.message);
        term.writeln(`\r\n\x1b[31m✗ Connection failed: ${err.message}\x1b[0m`);
      });
    })();

    const onResize = () => fitRef.current?.fit();
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      // Retire tous les listeners (socket + Manager de reconnexion) avant de
      // couper — évite l'accumulation de handlers si ce composant venait à
      // être remonté (même pattern que le fix de fuite mémoire des flux
      // automation/setup).
      socketRef.current?.removeAllListeners();
      socketRef.current?.io.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
      term.dispose();
      termRef.current = null;
    };
  }, [serverId]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              state === "connected"
                ? "bg-green-400"
                : state === "connecting" || state === "reconnecting"
                  ? "animate-pulse bg-yellow-400"
                  : state === "error"
                    ? "bg-red-400"
                    : "bg-zinc-600"
            }`}
          />
          <span className="text-xs font-mono text-zinc-400">
            {state === "connected"
              ? "Connected"
              : state === "connecting"
                ? "Connecting..."
                : state === "reconnecting"
                  ? "Reconnecting..."
                  : state === "error"
                    ? `Error${errorMsg ? `: ${errorMsg}` : ""}`
                    : "Closed"}
          </span>
        </div>
        <button
          type="button"
          onClick={disconnect}
          className="rounded px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden p-2" />
    </div>
  );
}
