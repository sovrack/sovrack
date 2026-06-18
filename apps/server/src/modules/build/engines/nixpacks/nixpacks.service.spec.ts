import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter } from 'events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import { NixpacksService } from './nixpacks.service';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const spawnMock = spawn as unknown as jest.Mock;

class MockChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

describe('NixpacksService', () => {
  let service: NixpacksService;
  let originalEnv: NodeJS.ProcessEnv;
  let originalCwd: string;
  let fakeSourceDir: string;
  let fakeNixpacksBin: string;

  const setupSpawnSuccess = (sideEffect?: (args: string[]) => void) => {
    spawnMock.mockImplementation(() => {
      const child = new MockChild();
      if (sideEffect) {
        setImmediate(() => {
          sideEffect(spawnMock.mock.calls[spawnMock.mock.calls.length - 1][1]);
          child.emit('close', 0);
        });
      } else {
        setImmediate(() => child.emit('close', 0));
      }
      return child;
    });
  };

  const setupSpawnFailure = (code: number, stderrMsg = 'nixpacks error') => {
    spawnMock.mockImplementation(() => {
      const child = new MockChild();
      setImmediate(() => {
        child.stderr.emit('data', Buffer.from(stderrMsg));
        child.emit('close', code);
      });
      return child;
    });
  };

  beforeEach(async () => {
    originalEnv = { ...process.env };
    originalCwd = process.cwd();
    delete process.env.NIXPACKS_BIN;
    spawnMock.mockReset();

    fakeSourceDir = mkdtempSync(join(tmpdir(), 'nixpacks-test-src-'));
    fakeNixpacksBin = mkdtempSync(join(tmpdir(), 'nixpacks-test-bin-')) + '/nixpacks';
    writeFileSync(fakeNixpacksBin, '#!/bin/sh\necho "1.30.0"');
    process.env.NIXPACKS_BIN = fakeNixpacksBin;

    const module: TestingModule = await Test.createTestingModule({
      providers: [NixpacksService],
    }).compile();
    service = module.get<NixpacksService>(NixpacksService);
    await service.onModuleInit();
  });

  afterEach(() => {
    process.env = originalEnv;
    process.chdir(originalCwd);
    rmSync(fakeSourceDir, { recursive: true, force: true });
    rmSync(join(fakeNixpacksBin, '..'), { recursive: true, force: true });
  });

  describe('binary detection', () => {
    it('should be available when NIXPACKS_BIN env points to a real file', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('should return the detected version on getVersion()', async () => {
      spawnMock.mockImplementation(() => {
        const child = new MockChild();
        setImmediate(() => {
          child.stdout.emit('data', Buffer.from('1.30.0\n'));
          child.emit('close', 0);
        });
        return child;
      });
      const fresh = new NixpacksService();
      await fresh.onModuleInit();
      expect(fresh.getVersion()).not.toBeNull();
      expect(fresh.getVersion()).toMatch(/^\d+\.\d+/);
    });

    it('should call "nixpacks --version" during onModuleInit', async () => {
      setupSpawnSuccess();
      const fresh = new NixpacksService();
      await fresh.onModuleInit();
      expect(spawnMock).toHaveBeenCalledWith(fakeNixpacksBin, ['--version'], expect.any(Object));
    });

    it('should fall back to /usr/local/bin/nixpacks when env is not set', async () => {
      delete process.env.NIXPACKS_BIN;
      setupSpawnSuccess();
      const fresh = new NixpacksService();
      await fresh.onModuleInit();
      const calledWith = spawnMock.mock.calls[0][0];
      expect(calledWith).toMatch(/nixpacks$/);
    });

    it('should mark unavailable when no candidate path exists', async () => {
      delete process.env.NIXPACKS_BIN;
      const fresh = new NixpacksService();
      await fresh.onModuleInit();
      expect(fresh.isAvailable()).toBe(false);
      expect(fresh.getVersion()).toBeNull();
    });

    it('should keep available=true but getVersion=null if --version fails', async () => {
      delete process.env.NIXPACKS_BIN;
      process.env.NIXPACKS_BIN = fakeNixpacksBin;
      setupSpawnFailure(1, 'version probe failed');
      const fresh = new NixpacksService();
      await fresh.onModuleInit();
      expect(fresh.isAvailable()).toBe(true);
      expect(fresh.getVersion()).toBeNull();
    });
  });

  describe('generatePlan()', () => {
    it('should throw BadRequestException when source path does not exist', async () => {
      await expect(
        service.generatePlan('/nonexistent/path/to/repo'),
      ).rejects.toThrow(/Chemin source introuvable/);
    });

    it('should run "nixpacks plan <src> --out <tmp>" and parse outputs', async () => {
      setupSpawnSuccess((args) => {
        const outIdx = args.indexOf('--out');
        const outDir = args[outIdx + 1];
        writeFileSync(join(outDir, 'Dockerfile'), 'FROM node:20\nCMD ["node", "index.js"]');
        writeFileSync(
          join(outDir, 'plan.json'),
          JSON.stringify({
            providers: [{ name: 'node' }],
            framework: 'nextjs',
            startCommand: 'node index.js',
          }),
        );
      });

      const result = await service.generatePlan(fakeSourceDir);

      expect(result.language).toBe('node');
      expect(result.framework).toBe('nextjs');
      expect(result.dockerfile).toContain('FROM node:20');
      expect(result.plan.framework).toBe('nextjs');
      expect(spawnMock).toHaveBeenCalledWith(
        fakeNixpacksBin,
        [
          'plan',
          fakeSourceDir,
          '--out',
          expect.stringMatching(/nixpacks-plan-/),
        ],
        expect.any(Object),
      );
    });

    it('should default framework to null when not in plan', async () => {
      setupSpawnSuccess((args) => {
        const outDir = args[args.indexOf('--out') + 1];
        writeFileSync(join(outDir, 'Dockerfile'), 'FROM scratch');
        writeFileSync(join(outDir, 'plan.json'), JSON.stringify({ providers: [{ name: 'go' }] }));
      });

      const result = await service.generatePlan(fakeSourceDir);
      expect(result.language).toBe('go');
      expect(result.framework).toBeNull();
    });

    it('should default language to "unknown" when providers array is missing', async () => {
      setupSpawnSuccess((args) => {
        const outDir = args[args.indexOf('--out') + 1];
        writeFileSync(join(outDir, 'Dockerfile'), 'FROM scratch');
        writeFileSync(join(outDir, 'plan.json'), JSON.stringify({}));
      });

      const result = await service.generatePlan(fakeSourceDir);
      expect(result.language).toBe('unknown');
    });

    it('should throw when Dockerfile is missing from Nixpacks output', async () => {
      setupSpawnSuccess((args) => {
        const outDir = args[args.indexOf('--out') + 1];
        writeFileSync(join(outDir, 'plan.json'), JSON.stringify({ providers: [] }));
      });

      await expect(service.generatePlan(fakeSourceDir)).rejects.toThrow(/Dockerfile ou plan\.json/);
    });

    it('should throw when plan.json is missing from Nixpacks output', async () => {
      setupSpawnSuccess((args) => {
        const outDir = args[args.indexOf('--out') + 1];
        writeFileSync(join(outDir, 'Dockerfile'), 'FROM scratch');
      });

      await expect(service.generatePlan(fakeSourceDir)).rejects.toThrow(/Dockerfile ou plan\.json/);
    });

    it('should propagate Nixpacks failure as BadRequestException', async () => {
      setupSpawnFailure(1, 'syntax error in package.json');

      await expect(service.generatePlan(fakeSourceDir)).rejects.toThrow(/Nixpacks a échoué/);
    });

    it('should require binary when not available', async () => {
      delete process.env.NIXPACKS_BIN;
      const fresh = new NixpacksService();
      await fresh.onModuleInit();

      await expect(fresh.generatePlan(fakeSourceDir)).rejects.toThrow(/Nixpacks n'est pas installé/);
    });

    it('should clean up the tmp output directory after success', async () => {
      let capturedOutDir: string | null = null;
      setupSpawnSuccess((args) => {
        capturedOutDir = args[args.indexOf('--out') + 1];
        writeFileSync(join(capturedOutDir, 'Dockerfile'), 'FROM scratch');
        writeFileSync(join(capturedOutDir, 'plan.json'), '{}');
      });

      await service.generatePlan(fakeSourceDir);
      expect(capturedOutDir).not.toBeNull();
      expect(existsSync(capturedOutDir!)).toBe(false);
    });

    it('should clean up the tmp output directory even on failure', async () => {
      let capturedOutDir: string | null = null;
      setupSpawnSuccess((args) => {
        capturedOutDir = args[args.indexOf('--out') + 1];
      });

      await expect(service.generatePlan(fakeSourceDir)).rejects.toThrow();
      expect(existsSync(capturedOutDir!)).toBe(false);
    });
  });

  describe('buildImage()', () => {
    it('should throw BadRequestException when source path does not exist', async () => {
      await expect(
        service.buildImage({ sourcePath: '/no/such/path', imageTag: 'myapp:dev' }),
      ).rejects.toThrow(/Chemin source introuvable/);
    });

    it('should require binary when not available', async () => {
      delete process.env.NIXPACKS_BIN;
      const fresh = new NixpacksService();
      await fresh.onModuleInit();

      await expect(
        fresh.buildImage({ sourcePath: fakeSourceDir, imageTag: 'myapp:dev' }),
      ).rejects.toThrow(/Nixpacks n'est pas installé/);
    });

    it('should call nixpacks build with the minimal arg set', async () => {
      let buildArgs: string[] | null = null;
      let planCallCount = 0;
      spawnMock.mockImplementation((_bin: string, args: string[]) => {
        const child = new MockChild();
        if (args[0] === 'build') {
          buildArgs = args;
          setImmediate(() => {
            child.emit('close', 0);
          });
        } else if (args[0] === 'plan') {
          planCallCount += 1;
          setImmediate(() => {
            const outDir = args[args.indexOf('--out') + 1];
            writeFileSync(join(outDir, 'Dockerfile'), 'FROM node:20');
            writeFileSync(join(outDir, 'plan.json'), JSON.stringify({ providers: [{ name: 'node' }] }));
            child.emit('close', 0);
          });
        }
        return child;
      });

      const result = await service.buildImage({
        sourcePath: fakeSourceDir,
        imageTag: 'myapp:abc123',
      });

      expect(buildArgs).toEqual([
        'build',
        fakeSourceDir,
        '--name', 'myapp:abc123',
        '--tag', 'myapp:abc123',
      ]);
      expect(result.imageTag).toBe('myapp:abc123');
      expect(result.dockerfile).toContain('FROM node:20');
      expect(planCallCount).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should pass --cwd when workingDir is set (monorepo)', async () => {
      let buildArgs: string[] | null = null;
      spawnMock.mockImplementation((_bin: string, args: string[]) => {
        const child = new MockChild();
        if (args[0] === 'build') {
          buildArgs = args;
          setImmediate(() => child.emit('close', 0));
        } else if (args[0] === 'plan') {
          setImmediate(() => {
            const outDir = args[args.indexOf('--out') + 1];
            writeFileSync(join(outDir, 'Dockerfile'), 'FROM node:20');
            writeFileSync(join(outDir, 'plan.json'), '{}');
            child.emit('close', 0);
          });
        }
        return child;
      });

      await service.buildImage({
        sourcePath: fakeSourceDir,
        imageTag: 'myapp:mono',
        workingDir: 'apps/web',
      });

      expect(buildArgs).toContain('--cwd');
      expect(buildArgs).toContain('apps/web');
    });

    it('should pass --build-cmd and --start-cmd overrides', async () => {
      let buildArgs: string[] | null = null;
      spawnMock.mockImplementation((_bin: string, args: string[]) => {
        const child = new MockChild();
        if (args[0] === 'build') {
          buildArgs = args;
          setImmediate(() => child.emit('close', 0));
        } else if (args[0] === 'plan') {
          setImmediate(() => {
            const outDir = args[args.indexOf('--out') + 1];
            writeFileSync(join(outDir, 'Dockerfile'), 'FROM node:20');
            writeFileSync(join(outDir, 'plan.json'), '{}');
            child.emit('close', 0);
          });
        }
        return child;
      });

      await service.buildImage({
        sourcePath: fakeSourceDir,
        imageTag: 'myapp:custom',
        buildCommand: 'pnpm build:prod',
        startCommand: 'node dist/server.js',
      });

      const bcIdx = buildArgs!.indexOf('--build-cmd');
      const scIdx = buildArgs!.indexOf('--start-cmd');
      expect(bcIdx).toBeGreaterThan(-1);
      expect(buildArgs![bcIdx + 1]).toBe('pnpm build:prod');
      expect(scIdx).toBeGreaterThan(-1);
      expect(buildArgs![scIdx + 1]).toBe('node dist/server.js');
    });

    it('should pass port as dockerfile.PORT=<port> env override', async () => {
      let buildArgs: string[] | null = null;
      spawnMock.mockImplementation((_bin: string, args: string[]) => {
        const child = new MockChild();
        if (args[0] === 'build') {
          buildArgs = args;
          setImmediate(() => child.emit('close', 0));
        } else if (args[0] === 'plan') {
          setImmediate(() => {
            const outDir = args[args.indexOf('--out') + 1];
            writeFileSync(join(outDir, 'Dockerfile'), 'FROM node:20');
            writeFileSync(join(outDir, 'plan.json'), '{}');
            child.emit('close', 0);
          });
        }
        return child;
      });

      await service.buildImage({
        sourcePath: fakeSourceDir,
        imageTag: 'myapp:port',
        port: 4242,
      });

      const pkgsIdx = buildArgs!.indexOf('--pkgs');
      expect(pkgsIdx).toBeGreaterThan(-1);
      expect(buildArgs![pkgsIdx + 1]).toBe('dockerfile.$PORT=4242');
    });

    it('should pass each buildEnv var as --env KEY=VALUE', async () => {
      let buildArgs: string[] | null = null;
      spawnMock.mockImplementation((_bin: string, args: string[]) => {
        const child = new MockChild();
        if (args[0] === 'build') {
          buildArgs = args;
          setImmediate(() => child.emit('close', 0));
        } else if (args[0] === 'plan') {
          setImmediate(() => {
            const outDir = args[args.indexOf('--out') + 1];
            writeFileSync(join(outDir, 'Dockerfile'), 'FROM node:20');
            writeFileSync(join(outDir, 'plan.json'), '{}');
            child.emit('close', 0);
          });
        }
        return child;
      });

      await service.buildImage({
        sourcePath: fakeSourceDir,
        imageTag: 'myapp:env',
        buildEnv: { NODE_ENV: 'production', NPM_TOKEN: 'secret' },
      });

      const envIndices: number[] = [];
      buildArgs!.forEach((arg, idx) => {
        if (arg === '--env') envIndices.push(idx);
      });
      expect(envIndices).toHaveLength(2);
      expect(buildArgs![envIndices[0] + 1]).toBe('NODE_ENV=production');
      expect(buildArgs![envIndices[1] + 1]).toBe('NPM_TOKEN=secret');
    });

    it('should propagate build failures with stderr context', async () => {
      spawnMock.mockImplementation((_bin: string, args: string[]) => {
        const child = new MockChild();
        if (args[0] === 'build') {
          setImmediate(() => {
            child.stderr.emit('data', Buffer.from('npm install failed: ECONNREFUSED'));
            child.emit('close', 137);
          });
        } else {
          setImmediate(() => child.emit('close', 0));
        }
        return child;
      });

      await expect(
        service.buildImage({ sourcePath: fakeSourceDir, imageTag: 'myapp:fail' }),
      ).rejects.toThrow(/code 137.*npm install failed/);
    });

    it('should return a positive durationMs after a successful build', async () => {
      spawnMock.mockImplementation((_bin: string, args: string[]) => {
        const child = new MockChild();
        if (args[0] === 'build') {
          setTimeout(() => child.emit('close', 0), 10);
        } else if (args[0] === 'plan') {
          setImmediate(() => {
            const outDir = args[args.indexOf('--out') + 1];
            writeFileSync(join(outDir, 'Dockerfile'), 'FROM node:20');
            writeFileSync(join(outDir, 'plan.json'), '{}');
            child.emit('close', 0);
          });
        }
        return child;
      });

      const result = await service.buildImage({
        sourcePath: fakeSourceDir,
        imageTag: 'myapp:timed',
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.buildLog).toBeDefined();
    });
  });

  describe('integration: buildImage calls generatePlan internally', () => {
    it('should call nixpacks plan after a successful nixpacks build', async () => {
      const seenSubcommands: string[] = [];
      spawnMock.mockImplementation((_bin: string, args: string[]) => {
        const child = new MockChild();
        seenSubcommands.push(args[0]);
        if (args[0] === 'plan') {
          setImmediate(() => {
            const outDir = args[args.indexOf('--out') + 1];
            writeFileSync(join(outDir, 'Dockerfile'), 'FROM node:20');
            writeFileSync(join(outDir, 'plan.json'), JSON.stringify({ framework: 'remix' }));
            child.emit('close', 0);
          });
        } else {
          setImmediate(() => child.emit('close', 0));
        }
        return child;
      });

      const result = await service.buildImage({
        sourcePath: fakeSourceDir,
        imageTag: 'myapp:integration',
      });

      expect(seenSubcommands).toContain('build');
      expect(seenSubcommands).toContain('plan');
      expect(result.plan.framework).toBe('remix');
    });
  });
});
