import {
  buildContainerCreateSpec,
  type ContainerSpecInput,
} from './container-create-spec.util';

const base = (over: Partial<ContainerSpecInput> = {}): ContainerSpecInput => ({
  imageRef: 'repo/app:1',
  containerName: 'app-123',
  labels: { 'deployautomation.project': 'p1' },
  envVars: ['A=1'],
  servicePort: 3000,
  publishPort: 8080,
  useTraefik: false,
  serviceType: 'APPLICATION',
  startCommand: null,
  stopTimeout: 30,
  binds: [],
  networkMode: 'project-p1',
  networkAlias: 'app',
  resourceLimits: null,
  ...over,
});

describe('buildContainerCreateSpec', () => {
  it('publishes the host port for a web service (no Traefik)', () => {
    const spec = buildContainerCreateSpec(base());
    expect(spec.HostConfig?.PortBindings).toEqual({
      '3000/tcp': [{ HostPort: '8080' }],
    });
    expect(spec.ExposedPorts).toEqual({ '3000/tcp': {} });
  });

  it('publishes NO host port in Traefik mode', () => {
    const spec = buildContainerCreateSpec(base({ useTraefik: true }));
    expect(spec.HostConfig?.PortBindings).toEqual({});
  });

  it('publishes NO host port for an internal-only DATABASE (dbHostPortDisabled) but still exposes the internal port', () => {
    const spec = buildContainerCreateSpec(
      base({ serviceType: 'DATABASE', dbHostPortDisabled: true }),
    );
    // No -p binding → not reachable from the host / outside the project…
    expect(spec.HostConfig?.PortBindings).toEqual({});
    // …but the internal port stays exposed so other project containers can
    // reach it by network alias.
    expect(spec.ExposedPorts).toEqual({ '3000/tcp': {} });
  });

  it('publishes the host port for a DATABASE exposed externally (dbHostPortDisabled false)', () => {
    const spec = buildContainerCreateSpec(
      base({
        serviceType: 'DATABASE',
        dbHostPortDisabled: false,
        servicePort: 5432,
        publishPort: 5433,
      }),
    );
    expect(spec.HostConfig?.PortBindings).toEqual({
      '5432/tcp': [{ HostPort: '5433' }],
    });
  });

  it('exposes nothing and publishes nothing for WORKER/CRON', () => {
    const worker = buildContainerCreateSpec(base({ serviceType: 'WORKER' }));
    expect(worker.ExposedPorts).toBeUndefined();
    expect(worker.HostConfig?.PortBindings).toEqual({});
  });

  it('uses RestartPolicy "no" for CRON, "unless-stopped" otherwise', () => {
    expect(
      buildContainerCreateSpec(base({ serviceType: 'CRON' })).HostConfig
        ?.RestartPolicy?.Name,
    ).toBe('no');
    expect(
      buildContainerCreateSpec(base()).HostConfig?.RestartPolicy?.Name,
    ).toBe('unless-stopped');
  });

  it('applies CPU/RAM quotas when provided', () => {
    const spec = buildContainerCreateSpec(
      base({ resourceLimits: { cpuLimit: 1, memLimitMb: 512 } }),
    );
    expect(spec.HostConfig?.NanoCpus).toBe(1_000_000_000);
    expect(spec.HostConfig?.Memory).toBe(536_870_912);
  });

  it('omits quotas when limits are null', () => {
    const spec = buildContainerCreateSpec(base());
    expect(spec.HostConfig?.NanoCpus).toBeUndefined();
    expect(spec.HostConfig?.Memory).toBeUndefined();
  });

  it('wraps the start command in sh -c, or omits it', () => {
    expect(
      buildContainerCreateSpec(base({ startCommand: 'npm start' })).Cmd,
    ).toEqual(['sh', '-c', 'npm start']);
    expect(buildContainerCreateSpec(base()).Cmd).toBeUndefined();
  });

  it('sets the stable network alias on the project network', () => {
    const spec = buildContainerCreateSpec(
      base({ networkMode: 'project-p1', networkAlias: 'api' }),
    );
    expect(spec.NetworkingConfig?.EndpointsConfig?.['project-p1']).toEqual({
      Aliases: ['api'],
    });
    expect(spec.HostConfig?.NetworkMode).toBe('project-p1');
  });

  it('passes through volume binds', () => {
    const spec = buildContainerCreateSpec(base({ binds: ['data:/var/lib'] }));
    expect(spec.HostConfig?.Binds).toEqual(['data:/var/lib']);
  });

  it('applies the non-privileged workload security baseline', () => {
    const spec = buildContainerCreateSpec(base());
    expect(spec.HostConfig).toEqual(
      expect.objectContaining({
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'],
        PidsLimit: 256,
        Init: true,
      }),
    );
  });
});
