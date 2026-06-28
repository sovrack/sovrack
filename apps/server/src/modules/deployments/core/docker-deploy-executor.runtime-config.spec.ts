import { DockerDeployExecutorService } from './docker-deploy-executor.service';

/**
 * Unit coverage for runtime-config resolution (P3): rollback/auto-heal must
 * restore the FROZEN specSnapshot config; a normal deploy must use live config.
 * resolveRuntimeConfig is pure (uses no injected dependency), so the executor is
 * built with stub deps and the private method is invoked directly.
 */
describe('DockerDeployExecutorService — resolveRuntimeConfig (specSnapshot pinning)', () => {
  const executor = new DockerDeployExecutorService(
    {} as never, // prisma
    {} as never, // docker
    {} as never, // gateway
    {} as never, // prelaunch
    {} as never, // traefik
    {} as never, // imageResolver
    {} as never, // logEmitter
    {} as never, // deploymentEnv
    {} as never, // deployRouting
    {} as never, // containerLifecycle
  );

  const resolve = (deployment: unknown) =>
    (
      executor as unknown as {
        resolveRuntimeConfig: (d: unknown) => {
          port: number;
          startCommand: string | null;
          healthcheckPath: string | null;
          cpuLimit: number | null;
          memLimitMb: number | null;
        };
      }
    ).resolveRuntimeConfig(deployment);

  const liveService = {
    port: 4000,
    startCommand: 'live-cmd',
    healthcheckPath: '/live',
    cpuLimit: 2,
    memLimitMb: 1024,
  };
  const snapshot = {
    port: 3000,
    startCommand: 'snap-cmd',
    healthcheckPath: '/snap',
    cpuLimit: 0.5,
    memLimitMb: 256,
  };

  it('rollback restores the frozen specSnapshot config, not live config', () => {
    const cfg = resolve({
      isRollback: true,
      isAutoHealed: false,
      specSnapshot: snapshot,
      service: liveService,
    });
    expect(cfg).toEqual({
      port: 3000,
      startCommand: 'snap-cmd',
      healthcheckPath: '/snap',
      cpuLimit: 0.5,
      memLimitMb: 256,
    });
  });

  it('auto-heal restores the frozen specSnapshot config', () => {
    const cfg = resolve({
      isRollback: false,
      isAutoHealed: true,
      specSnapshot: snapshot,
      service: liveService,
    });
    expect(cfg.port).toBe(3000);
    expect(cfg.memLimitMb).toBe(256);
  });

  it('normal deploy uses live config (snapshot ignored)', () => {
    const cfg = resolve({
      isRollback: false,
      isAutoHealed: false,
      specSnapshot: snapshot,
      service: liveService,
    });
    expect(cfg).toEqual({
      port: 4000,
      startCommand: 'live-cmd',
      healthcheckPath: '/live',
      cpuLimit: 2,
      memLimitMb: 1024,
    });
  });

  it('falls back field-by-field to live when the snapshot omits a value', () => {
    const cfg = resolve({
      isRollback: true,
      isAutoHealed: false,
      specSnapshot: { port: 3000 }, // only port frozen
      service: liveService,
    });
    expect(cfg.port).toBe(3000); // from snapshot
    expect(cfg.startCommand).toBe('live-cmd'); // missing → live
    expect(cfg.cpuLimit).toBe(2); // missing → live
  });

  it('defaults port to 3000 when neither snapshot nor service provides one', () => {
    const cfg = resolve({
      isRollback: false,
      isAutoHealed: false,
      specSnapshot: null,
      service: null,
    });
    expect(cfg.port).toBe(3000);
    expect(cfg.startCommand).toBeNull();
  });

  it('ignores a non-object (array) specSnapshot and uses live config', () => {
    const cfg = resolve({
      isRollback: true,
      isAutoHealed: false,
      specSnapshot: [1, 2, 3],
      service: liveService,
    });
    expect(cfg.port).toBe(4000);
  });
});
