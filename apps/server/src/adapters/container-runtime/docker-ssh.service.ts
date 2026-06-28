import { Inject, Injectable } from '@nestjs/common';
import type { SshConnection, SshExecResult } from '../ssh/ssh-executor.service';
import type { ISshExecutor } from '../ssh/ports/ssh-executor.port';
import { SSH_EXECUTOR } from '../ssh/ports/ssh-executor.port';

/**
 * Docker operations performed over an SSH shell (the "no TLS" path). Centralises
 * every `docker …` command string the platform shells out over SSH, so they are
 * defined once instead of being copy-pasted across monitoring + deployments.
 *
 * The TLS Docker Engine API path lives in {@link DockerApiService}; this one is
 * the SSH fallback used for servers without a configured DockerConnection.
 */
@Injectable()
export class DockerSshService {
  private static readonly STATS_FORMAT =
    '{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}';

  constructor(@Inject(SSH_EXECUTOR) private readonly ssh: ISshExecutor) {}

  private static sq(arg: string): string {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  private static dq(arg: string): string {
    return `"${arg.replace(/["\\$`!]/g, '\\$&')}"`;
  }

  /** `docker stats` for a single container; returns the raw line or `NOT_FOUND`. */
  async containerStats(
    conn: SshConnection,
    containerName: string,
  ): Promise<string> {
    const r = await this.ssh.exec(
      conn,
      `docker stats --no-stream --format ${DockerSshService.sq(DockerSshService.STATS_FORMAT)} ${DockerSshService.sq(containerName)} 2>/dev/null || echo "NOT_FOUND"`,
    );
    return r.stdout.trim();
  }

  /**
   * `docker stats` for all containers of a project. The deploy executor names
   * containers `deploy-<projectSlug>-<service>-<depId>`, so we match the name
   * field (2nd column) starting with `deploy-<projectSlug>-`. `.` in the slug is
   * matched as `[.-]` to bridge the two slugify rules (executor turns `.`→`-`).
   */
  async projectStats(
    conn: SshConnection,
    projectSlug: string,
  ): Promise<string> {
    const slugPattern = projectSlug.replace(/\./g, '[.-]');
    const r = await this.ssh.exec(
      conn,
      `docker stats --no-stream --format ${DockerSshService.sq(DockerSshService.STATS_FORMAT)} 2>/dev/null | grep ${DockerSshService.sq(`^[^|]*|deploy-${slugPattern}-`)} || true`,
    );
    return r.stdout.trim();
  }

  /** `docker ps` status string for a single named container. */
  async containerStatus(
    conn: SshConnection,
    containerName: string,
  ): Promise<string> {
    const r = await this.ssh.exec(
      conn,
      `docker ps --filter ${DockerSshService.sq(`name=${containerName}`)} --format ${DockerSshService.sq('{{.Status}}')} 2>/dev/null`,
    );
    return r.stdout.trim();
  }

  /** Tail of `docker logs`; appends a CONTAINER_NOT_FOUND sentinel on failure. */
  async containerLogs(
    conn: SshConnection,
    containerName: string,
    tail: number,
  ): Promise<string> {
    const r = await this.ssh.exec(
      conn,
      `docker logs --tail ${String(tail)} --timestamps ${DockerSshService.sq(containerName)} 2>&1 || echo "CONTAINER_NOT_FOUND"`,
    );
    return r.stdout.trim();
  }

  /** First container name matching a (case-insensitive) pattern, or ''. */
  async findContainerByName(
    conn: SshConnection,
    namePattern: string,
  ): Promise<string> {
    const r = await this.ssh.exec(
      conn,
      `docker ps -a --format ${DockerSshService.sq('{{.Names}}')} | grep -i ${DockerSshService.sq(namePattern)} | head -1`,
    );
    return r.stdout.trim();
  }

  /** All container names (`docker ps -a`). */
  async listContainerNames(conn: SshConnection): Promise<string> {
    const r = await this.ssh.exec(
      conn,
      `docker ps -a --format ${DockerSshService.sq('{{.Names}}')}`,
    );
    return r.stdout.trim();
  }

  /** Raw `docker logs` result for an exact container name. */
  async logsRaw(
    conn: SshConnection,
    containerName: string,
    tail: number,
  ): Promise<SshExecResult> {
    return this.ssh.exec(
      conn,
      `docker logs --tail=${String(tail)} --timestamps ${DockerSshService.sq(containerName)} 2>&1`,
    );
  }

  /** Immutable image digest (sha256:…) via `docker inspect`, or null. */
  async imageDigest(
    conn: SshConnection,
    imageRef: string,
  ): Promise<string | null> {
    const escaped = DockerSshService.sq(imageRef);
    const r = await this.ssh.exec(
      conn,
      `docker inspect --format=${DockerSshService.sq('{{index .RepoDigests 0}}')} ${escaped} ` +
        `|| docker inspect --format=${DockerSshService.sq('{{.Id}}')} ${escaped}`,
    );
    return (
      (r.stdout || '')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('sha256:')) ?? null
    );
  }
}
