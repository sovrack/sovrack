import {
  buildContainerName,
  buildContainerPrefix,
  buildServiceAlias,
  buildDeployautomationLabels,
  toDockerEnvArray,
} from './container-spec.util';

describe('buildServiceAlias', () => {
  it('= normalized service name (stable DNS)', () => {
    expect(buildServiceAlias('Postgres DB')).toBe('postgres-db');
  });
  it('preserves an already-valid name', () => {
    expect(buildServiceAlias('api')).toBe('api');
  });
  it('retire les tirets en bord', () => {
    expect(buildServiceAlias('--api--')).toBe('api');
  });
  it('repli "service" si vide', () => {
    expect(buildServiceAlias('!!!')).toBe('service');
  });
});

describe('container-spec.util', () => {
  describe('buildContainerPrefix', () => {
    it('normalizes to lowercase and replaces non-Docker characters', () => {
      expect(buildContainerPrefix('My Proj', 'API Svc')).toBe(
        'deploy-my-proj-api-svc-',
      );
    });
    it('conserve tirets et underscores', () => {
      expect(buildContainerPrefix('a_b', 'c-d')).toBe('deploy-a_b-c-d-');
    });
  });

  describe('buildContainerName', () => {
    it('= prefix + first 8 characters of the ID', () => {
      expect(buildContainerName('proj', 'svc', 'abcdef1234567890')).toBe(
        'deploy-proj-svc-abcdef12',
      );
    });
  });

  describe('toDockerEnvArray', () => {
    it('convertit en KEY=VALUE', () => {
      expect(
        toDockerEnvArray([
          { key: 'A', value: '1' },
          { key: 'B', value: 'x=y' },
        ]),
      ).toEqual(['A=1', 'B=x=y']);
    });
    it('tableau vide → []', () => {
      expect(toDockerEnvArray([])).toEqual([]);
    });
  });

  describe('buildDeployautomationLabels', () => {
    it('pose tous les labels deployautomation.* avec repli sur ""', () => {
      expect(
        buildDeployautomationLabels({
          projectId: 'p1',
          projectName: 'proj',
          serviceName: 'svc',
          deploymentId: 'd1',
        }),
      ).toEqual({
        'deployautomation.managed': 'true',
        'deployautomation.project': 'p1',
        'deployautomation.project_name': 'proj',
        'deployautomation.service': '',
        'deployautomation.service_name': 'svc',
        'deployautomation.environment': '',
        'deployautomation.service_env': '',
        'deployautomation.deployment': 'd1',
      });
    });
    it('remplit service/env/serviceEnv quand fournis', () => {
      const labels = buildDeployautomationLabels({
        projectId: 'p1',
        projectName: 'proj',
        serviceId: 's1',
        serviceName: 'svc',
        environmentName: 'PRODUCTION',
        serviceEnvId: 'se1',
        deploymentId: 'd1',
      });
      expect(labels['deployautomation.service']).toBe('s1');
      expect(labels['deployautomation.environment']).toBe('PRODUCTION');
      expect(labels['deployautomation.service_env']).toBe('se1');
    });
  });
});
