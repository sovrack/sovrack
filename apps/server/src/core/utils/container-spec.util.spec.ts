import {
  buildContainerName,
  buildContainerPrefix,
  buildServiceAlias,
  buildplatformLabels,
  toDockerEnvArray,
} from './container-spec.util';

describe('buildServiceAlias', () => {
  it('= nom du service normalisé (DNS stable)', () => {
    expect(buildServiceAlias('Postgres DB')).toBe('postgres-db');
  });
  it('conserve un nom déjà valide', () => {
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
    it('normalise en minuscules et remplace les caractères non Docker', () => {
      expect(buildContainerPrefix('My Proj', 'API Svc')).toBe(
        'deploy-my-proj-api-svc-',
      );
    });
    it('conserve tirets et underscores', () => {
      expect(buildContainerPrefix('a_b', 'c-d')).toBe('deploy-a_b-c-d-');
    });
  });

  describe('buildContainerName', () => {
    it('= préfixe + 8 premiers caractères de l’ID', () => {
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

  describe('buildplatformLabels', () => {
    it('pose tous les labels platform.* avec repli sur ""', () => {
      expect(
        buildplatformLabels({
          projectId: 'p1',
          projectName: 'proj',
          serviceName: 'svc',
          deploymentId: 'd1',
        }),
      ).toEqual({
        'platform.managed': 'true',
        'platform.project': 'p1',
        'platform.project_name': 'proj',
        'platform.service': '',
        'platform.service_name': 'svc',
        'platform.environment': '',
        'platform.service_env': '',
        'platform.deployment': 'd1',
      });
    });
    it('remplit service/env/serviceEnv quand fournis', () => {
      const labels = buildplatformLabels({
        projectId: 'p1',
        projectName: 'proj',
        serviceId: 's1',
        serviceName: 'svc',
        environmentName: 'PRODUCTION',
        serviceEnvId: 'se1',
        deploymentId: 'd1',
      });
      expect(labels['platform.service']).toBe('s1');
      expect(labels['platform.environment']).toBe('PRODUCTION');
      expect(labels['platform.service_env']).toBe('se1');
    });
  });
});
