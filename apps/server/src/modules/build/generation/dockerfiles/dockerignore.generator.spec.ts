import { DockerignoreGenerator } from './dockerignore.generator';

describe('DockerignoreGenerator', () => {
  it('ignores VCS, deps, build output and secrets', () => {
    const lines = new DockerignoreGenerator().generate().split('\n');
    for (const entry of [
      '.git',
      'node_modules',
      'dist',
      '.env',
      '.env.*',
      '*.log',
    ]) {
      expect(lines).toContain(entry);
    }
  });
});
