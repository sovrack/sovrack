import { GitlabCiGenerator } from './gitlab-ci.generator';

describe('GitlabCiGenerator', () => {
  const gen = new GitlabCiGenerator();

  it('produit les 3 stages test/build/notify', () => {
    const out = gen.generate({ projectType: 'nodejs', branches: ['main'] });
    expect(out).toContain('stages:');
    expect(out).toContain('  - build');
    expect(out).toContain('  - notify');
  });

  it('émet le job deploy qui curl le webhook platform (déclenchement CI)', () => {
    const out = gen.generate({ projectType: 'nodejs', branches: ['main'] });
    expect(out).toContain('deploy:');
    expect(out).toContain('$PLATFORM_DEPLOY_HOOK');
    expect(out).toContain('X-Gitlab-Token: $platform_DEPLOY_TOKEN');
    // No-op explicite si la variable n'est pas définie.
    expect(out).toContain('déploiement non déclenché');
  });

  it('inclut un stage test pour un type de projet connu', () => {
    const out = gen.generate({ projectType: 'python', branches: ['main'] });
    expect(out).toContain('test:');
    expect(out).toContain('stage: test');
  });

  it('omet le stage test pour un type inconnu', () => {
    const out = gen.generate({ projectType: 'cobol', branches: ['main'] });
    expect(out).not.toContain('stage: test');
    expect(out).toContain('build:');
  });

  it('reprend les branches fournies dans les règles only', () => {
    const out = gen.generate({
      projectType: 'go',
      branches: ['develop', 'release'],
    });
    expect(out).toContain('    - develop');
    expect(out).toContain('    - release');
  });

  it('cible .gitlab-ci.yml', () => {
    expect(gen.getFilePath()).toBe('.gitlab-ci.yml');
  });
});
