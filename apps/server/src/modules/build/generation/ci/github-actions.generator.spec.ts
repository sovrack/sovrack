import { GithubActionsGenerator } from './github-actions.generator';

describe('GithubActionsGenerator', () => {
  const gen = new GithubActionsGenerator();

  it('generates a workflow triggered on push to the provided branches', () => {
    const out = gen.generate({
      projectType: 'nodejs',
      branches: ['main', 'qa'],
    });
    expect(out).toContain('name: Build & Push Docker Image');
    expect(out).toContain('on:');
    expect(out).toContain('      - main');
    expect(out).toContain('      - qa');
  });

  it('emits the Deploy Automation deployment trigger step', () => {
    const out = gen.generate({ projectType: 'nodejs', branches: ['main'] });
    expect(out).toContain('Trigger Deploy Automation deployment');
    expect(out).toContain('secrets.DA_DEPLOY_HOOK');
    expect(out).toContain('X-Hub-Signature-256: $DA_DEPLOY_TOKEN');
    expect(out).toContain('déploiement non déclenché');
  });

  it('construit et pousse l’image (login + build-push)', () => {
    const out = gen.generate({ projectType: 'go', branches: ['main'] });
    expect(out).toContain('Log in to GHCR');
    expect(out).toContain('Build and push');
  });

  it('cible .github/workflows/build.yml', () => {
    expect(gen.getFilePath()).toBe('.github/workflows/build.yml');
  });
});
