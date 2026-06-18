import { GithubActionsGenerator } from './github-actions.generator';

describe('GithubActionsGenerator', () => {
  const gen = new GithubActionsGenerator();

  it('génère un workflow déclenché sur push des branches fournies', () => {
    const out = gen.generate({
      projectType: 'nodejs',
      branches: ['main', 'qa'],
    });
    expect(out).toContain('name: Build & Push Docker Image');
    expect(out).toContain('on:');
    expect(out).toContain('      - main');
    expect(out).toContain('      - qa');
  });

  it('émet l’étape de déclenchement du déploiement platform', () => {
    const out = gen.generate({ projectType: 'nodejs', branches: ['main'] });
    expect(out).toContain('Trigger platform deployment');
    expect(out).toContain('secrets.PLATFORM_DEPLOY_HOOK');
    expect(out).toContain('X-Hub-Signature-256: $platform_DEPLOY_TOKEN');
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
