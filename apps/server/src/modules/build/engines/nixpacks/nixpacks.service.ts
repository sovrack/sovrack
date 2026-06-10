import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

export type NixpacksPlan = {
  /** Detected language (e.g. "node", "python", "go", "rust", "static") */
  language: string;
  /** Detected framework (e.g. "nextjs", "nestjs", "django", "flask") */
  framework: string | null;
  /** Generated Dockerfile content */
  dockerfile: string;
  /** Static plan JSON (start command, build command, env, etc.) */
  plan: Record<string, unknown>;
};

export type NixpacksBuildOptions = {
  /** Path to source directory (cloned repo) */
  sourcePath: string;
  /** Image tag to apply (e.g. "myapp:main") */
  imageTag: string;
  /** Working directory inside the source path (for monorepos) */
  workingDir?: string;
  /** Environment variables to set during build */
  buildEnv?: Record<string, string>;
  /** Environment variables to set in the runtime image */
  runtimeEnv?: Record<string, string>;
  /** Build command override (auto-detected by default) */
  buildCommand?: string;
  /** Start command override (auto-detected by default) */
  startCommand?: string;
  /** Port to expose (for image metadata) */
  port?: number;
  /** Use a specific Nixpacks build cache (Nix store) */
  cachePath?: string;
};

export type NixpacksBuildResult = {
  imageTag: string;
  dockerfile: string;
  plan: Record<string, unknown>;
  durationMs: number;
  buildLog: string;
};

/**
 * NixpacksService — wraps the Nixpacks binary for build plan generation
 * and image building. Nixpacks is a Rust tool from Railway that:
 *
 *   - Detects the language/framework from a project
 *   - Generates a Dockerfile automatically (no Dockerfile needed)
 *   - Builds the image with a Nix-based cache for fast rebuilds
 *
 * platform uses Nixpacks in two places:
 *
 *   1. `generatePlan()` — backend previews the build (for the UI: "What will
 *      Nixpacks do?") and pushes the generated Dockerfile to the repo.
 *
 *   2. `buildImage()` — backend calls `nixpacks build` to build the image
 *      directly. (Currently we delegate to the VPS via the
 *      `deploy-nixpacks.yml` playbook, but this method is here for unit
 *      tests and for future registry-build support.)
 *
 * Reference: https://github.com/railwayapp/nixpacks
 */
@Injectable()
export class NixpacksService implements OnModuleInit {
  private readonly logger = new Logger(NixpacksService.name);
  private binaryPath: string | null = null;
  private versionChecked = false;
  private cachedVersion: string | null = null;

  async onModuleInit(): Promise<void> {
    this.binaryPath = this.resolveBinaryPath();
    if (this.binaryPath) {
      try {
        this.cachedVersion = await this.runNixpacksCommand(['--version'], {
          stdio: 'pipe',
        }).then((output) => output.trim());
        this.versionChecked = true;
        this.logger.log(`Nixpacks binary: ${this.binaryPath} (v${this.cachedVersion})`);
      } catch (error) {
        this.logger.warn(
          `Nixpacks binary found at ${this.binaryPath} but failed to execute: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    } else {
      this.logger.warn(
        'Nixpacks binary not found. Local Nixpacks builds will be unavailable. ' +
          'On the target VPS, install Nixpacks via the deploy-nixpacks.yml playbook ' +
          '(idempotent: only installs if missing).',
      );
    }
  }

  /**
   * Returns true if the Nixpacks binary is available on the backend.
   * (Always true in the production Docker image; may be false in dev.)
   */
  isAvailable(): boolean {
    return this.binaryPath !== null;
  }

  /**
   * Returns the Nixpacks version, or null if not installed.
   */
  getVersion(): string | null {
    return this.cachedVersion;
  }

  /**
   * Generate a Nixpacks build plan for the given source directory.
   * Returns the detected language/framework, the generated Dockerfile,
   * and the static plan JSON.
   *
   * Does NOT build the image — this is the equivalent of `nixpacks plan`.
   */
  async generatePlan(sourcePath: string): Promise<NixpacksPlan> {
    if (!existsSync(sourcePath)) {
      throw new BadRequestException(
        `Chemin source introuvable: ${sourcePath}`,
      );
    }
    this.requireBinary();

    const tmpDir = await mkdtemp(join(tmpdir(), 'nixpacks-plan-'));
    try {
      // `nixpacks plan <path> --out <out-dir>` writes Dockerfile + plan.json
      await this.runNixpacksCommand(
        ['plan', sourcePath, '--out', tmpDir],
        { stdio: 'pipe' },
      );

      const dockerfilePath = join(tmpDir, 'Dockerfile');
      const planPath = join(tmpDir, 'plan.json');

      if (!existsSync(dockerfilePath) || !existsSync(planPath)) {
        throw new BadRequestException(
          'Nixpacks n\'a pas produit de Dockerfile ou plan.json',
        );
      }

      const [dockerfile, planJson] = await Promise.all([
        readFile(dockerfilePath, 'utf-8'),
        readFile(planPath, 'utf-8'),
      ]);
      const plan = JSON.parse(planJson) as Record<string, unknown>;

      const providers = (plan.providers as Array<{ name?: string }>) ?? [];
      const language = providers[0]?.name ?? 'unknown';
      const framework = (plan.framework as string | null) ?? null;

      return { language, framework, dockerfile, plan };
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Build a Docker image using Nixpacks. This calls `nixpacks build` which
   * detects the language, generates a Dockerfile, and produces an image
   * tagged with `imageTag`.
   *
   * Requires Nixpacks binary on the host AND Docker daemon access. The
   * default platform deployment delegates the build to the VPS via Ansible
   * (see `deploy-nixpacks.yml`), so this method is mainly for testing
   * and for the future "build on backend, push to registry" path.
   */
  async buildImage(options: NixpacksBuildOptions): Promise<NixpacksBuildResult> {
    if (!existsSync(options.sourcePath)) {
      throw new BadRequestException(
        `Chemin source introuvable: ${options.sourcePath}`,
      );
    }
    this.requireBinary();

    const args: string[] = ['build', options.sourcePath, '--name', options.imageTag, '--tag', options.imageTag];
    if (options.workingDir) {
      args.push('--cwd', options.workingDir);
    }
    if (options.buildCommand) {
      args.push('--build-cmd', options.buildCommand);
    }
    if (options.startCommand) {
      args.push('--start-cmd', options.startCommand);
    }
    if (options.port !== undefined) {
      args.push('--pkgs', `dockerfile.$PORT=${String(options.port)}`);
    }
    for (const [key, value] of Object.entries(options.buildEnv ?? {})) {
      args.push('--env', `${key}=${value}`);
    }

    const startedAt = Date.now();
    const buildLog = await this.runNixpacksCommand(args, { stdio: 'pipe' });
    const durationMs = Date.now() - startedAt;

    // After build, also generate the plan to return the dockerfile + plan
    const plan = await this.generatePlan(options.sourcePath);

    return {
      imageTag: options.imageTag,
      dockerfile: plan.dockerfile,
      plan: plan.plan as Record<string, unknown>,
      durationMs,
      buildLog,
    };
  }

  /**
   * Run a Nixpacks command and capture stdout/stderr.
   * Throws if the binary is not installed or the command fails.
   */
  private async runNixpacksCommand(
    args: string[],
    options: { stdio: 'pipe' | 'inherit' } = { stdio: 'pipe' },
  ): Promise<string> {
    if (!this.binaryPath) {
      throw new BadRequestException(
        'Nixpacks n\'est pas installé sur le backend. ' +
          'Sur le VPS, il est installé automatiquement par deploy-nixpacks.yml.',
      );
    }

    return new Promise<string>((resolve, reject) => {
      const child = spawn(this.binaryPath as string, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf-8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf-8');
      });
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new BadRequestException(
              `Nixpacks a échoué (code ${code}): ${stderr.trim() || stdout.trim()}`,
            ),
          );
        }
      });
    });
  }

  private requireBinary(): void {
    if (!this.binaryPath) {
      throw new BadRequestException(
        'Nixpacks n\'est pas installé sur le backend. ' +
          'Pour les builds Nixpacks, utilisez le mode LOCAL — ' +
          'le playbook deploy-nixpacks.yml installe Nixpacks sur le VPS automatiquement.',
      );
    }
  }

  private resolveBinaryPath(): string | null {
    const candidates = [
      process.env.NIXPACKS_BIN,
      '/usr/local/bin/nixpacks',
      '/usr/bin/nixpacks',
      resolve(process.cwd(), 'node_modules/.bin/nixpacks'),
    ];
    for (const candidate of candidates) {
      if (candidate && existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}
