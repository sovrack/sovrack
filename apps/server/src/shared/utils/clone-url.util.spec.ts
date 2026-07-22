import { buildAuthenticatedCloneUrl } from './clone-url.util';

describe('buildAuthenticatedCloneUrl', () => {
  it('injecte le token oauth2 pour une URL https', () => {
    expect(
      buildAuthenticatedCloneUrl('https://gitlab.com', 'grp/app', 'TKN'),
    ).toBe('https://oauth2:TKN@gitlab.com/grp/app.git');
  });

  it('sans token → URL nue', () => {
    expect(
      buildAuthenticatedCloneUrl('https://gitlab.com', 'grp/app', ''),
    ).toBe('https://gitlab.com/grp/app.git');
  });

  it('retire le slash final du providerUrl', () => {
    expect(
      buildAuthenticatedCloneUrl('https://gitlab.com/', 'grp/app', 'TKN'),
    ).toBe('https://oauth2:TKN@gitlab.com/grp/app.git');
  });

  it('handles a self-hosted host', () => {
    expect(
      buildAuthenticatedCloneUrl(
        'https://gitlab.com',
        'deploy-automation/svc',
        'glpat-xxx',
      ),
    ).toBe('https://oauth2:glpat-xxx@gitlab.com/deploy-automation/svc.git');
  });

  it('n’injecte pas le token sur une URL non-https (comportement historique)', () => {
    expect(
      buildAuthenticatedCloneUrl('http://gitlab.local', 'grp/app', 'TKN'),
    ).toBe('http://gitlab.local/grp/app.git');
  });
});
