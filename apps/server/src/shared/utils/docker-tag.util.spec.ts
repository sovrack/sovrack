import { sanitizeDockerTag } from './docker-tag.util';

describe('sanitizeDockerTag', () => {
  it('lowercases and keeps already-valid tags', () => {
    expect(sanitizeDockerTag('V1.2.3')).toBe('v1.2.3');
  });

  it('replaces runs of invalid characters with a single dash', () => {
    expect(sanitizeDockerTag('feature/My Branch!!')).toBe('feature-my-branch');
  });

  it('strips leading and trailing dashes', () => {
    expect(sanitizeDockerTag('---abc---')).toBe('abc');
  });

  it('falls back to "latest" when nothing usable remains', () => {
    expect(sanitizeDockerTag('!!!')).toBe('latest');
    expect(sanitizeDockerTag('   ')).toBe('latest');
  });
});
