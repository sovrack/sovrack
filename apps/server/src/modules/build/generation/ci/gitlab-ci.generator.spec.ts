import { GitlabCiGenerator } from './gitlab-ci.generator';

describe('GitlabCiGenerator', () => {
  const gen = new GitlabCiGenerator();

  it('produit les 3 stages test/build/notify', () => {
    const out = gen.generate({ projectType: 'nodejs', branches: ['main'] });
    expect(out).toContain('stages:');
    expect(out).toContain('  - build');
    expect(out).toContain('  - notify');
  });

  it('emits the deploy job that curls the Deploy Automation webhook (CI trigger)', () => {
    const out = gen.generate({ projectType: 'nodejs', branches: ['main'] });
    expect(out).toContain('deploy:');
    expect(out).toContain('$DA_DEPLOY_HOOK');
    expect(out).toContain('X-Gitlab-Token: $DA_DEPLOY_TOKEN');
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

  it('uses the provided branches in the only rules', () => {
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
