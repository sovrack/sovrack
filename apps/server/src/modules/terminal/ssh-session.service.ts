import { Injectable, Logger } from '@nestjs/common';
import { Client as SshClient, type ClientChannel } from 'ssh2';

export type OpenSshShellInput = {
  host: string;
  port: number;
  username: string;
  privateKey: string;
  cols: number;
  rows: number;
  readyTimeoutMs: number;
  keepaliveIntervalMs: number;
  inactivityTimeoutMs: number;
  hostVerifier?: (key: Buffer | string) => boolean;
};

export type OpenSshShellHandlers = {
  onData: (data: string) => void;
  onClose: (code: number | null) => void;
  onError: (message: string) => void;
};

type SshSessionEntry = {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => void;
};

@Injectable()
export class SshSessionService {
  private readonly logger = new Logger(SshSessionService.name);

  async openShell(
    input: OpenSshShellInput,
    handlers: OpenSshShellHandlers,
  ): Promise<SshSessionEntry> {
    return await new Promise<SshSessionEntry>((resolve, reject) => {
      const conn = new SshClient();
      let stream: ClientChannel | null = null;
      let inactivityTimer: NodeJS.Timeout | null = null;
      let settled = false;

      const clearInactivityTimer = () => {
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
      };

      const forceClose = () => {
        if (stream && !stream.destroyed) {
          stream.end();
        }
        conn.end();
      };

      const touchActivity = () => {
        if (input.inactivityTimeoutMs <= 0) {
          return;
        }
        clearInactivityTimer();
        inactivityTimer = setTimeout(() => {
          handlers.onError('Session SSH fermée pour inactivité.');
          forceClose();
        }, input.inactivityTimeoutMs);
      };

      conn.on('ready', () => {
        conn.shell(
          {
            term: 'xterm-256color',
            cols: input.cols,
            rows: input.rows,
          },
          (err, sh) => {
            if (err) {
              if (!settled) {
                settled = true;
                reject(err);
              }
              handlers.onError(`Shell error: ${err.message}`);
              forceClose();
              return;
            }

            stream = sh;
            touchActivity();

            sh.on('data', (data: Buffer | string) => {
              touchActivity();
              handlers.onData(
                typeof data === 'string' ? data : data.toString('utf-8'),
              );
            });

            sh.stderr.on('data', (data: Buffer | string) => {
              touchActivity();
              handlers.onData(
                typeof data === 'string' ? data : data.toString('utf-8'),
              );
            });

            sh.on('close', (code: number | null) => {
              clearInactivityTimer();
              handlers.onClose(code);
              conn.end();
            });

            if (!settled) {
              settled = true;
              resolve({
                write: (data: string) => {
                  if (!stream || stream.destroyed) {
                    return;
                  }
                  touchActivity();
                  stream.write(data);
                },
                resize: (cols: number, rows: number) => {
                  if (!stream || stream.destroyed) {
                    return;
                  }
                  touchActivity();
                  (
                    stream as ClientChannel & {
                      setWindow: (
                        rows: number,
                        cols: number,
                        height: number,
                        width: number,
                      ) => void;
                    }
                  ).setWindow(rows, cols, 0, 0);
                },
                close: () => {
                  clearInactivityTimer();
                  forceClose();
                },
              });
            }
          },
        );
      });

      conn.on('error', (err) => {
        clearInactivityTimer();
        const message = `SSH connection error: ${err.message}`;
        this.logger.error(message);
        handlers.onError(message);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      conn.connect({
        host: input.host,
        port: input.port,
        username: input.username,
        privateKey: input.privateKey,
        readyTimeout: input.readyTimeoutMs,
        keepaliveInterval: input.keepaliveIntervalMs,
        hostVerifier: input.hostVerifier,
      });
    });
  }
}
