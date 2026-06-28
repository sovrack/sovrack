import { isNamespacedRepoPath, normalizeRepoPath } from './repo-path.util';

describe('repo-path.util', () => {
  describe('normalizeRepoPath', () => {
    it('strips scheme/host and trailing .git', () => {
      expect(normalizeRepoPath('https://gitlab.com/group/repo.git')).toBe(
        'group/repo',
      );
    });

    it('strips git@ ssh prefix', () => {
      expect(normalizeRepoPath('git@gitlab.com:group/repo.git')).toBe(
        'group/repo',
      );
    });

    it('is idempotent on a bare path', () => {
      expect(normalizeRepoPath('group/repo')).toBe('group/repo');
    });
  });

  describe('isNamespacedRepoPath', () => {
    it('accepts a proper namespace/project path', () => {
      expect(isNamespacedRepoPath('test-deploy-devops/test-frontend')).toBe(
        true,
      );
    });

    it('accepts a full URL that normalizes to a namespaced path', () => {
      expect(
        isNamespacedRepoPath('https://gitlab.com/group/sub/repo.git'),
      ).toBe(true);
    });

    it('rejects a bare project name with no namespace', () => {
      // This is the bug that produced https://gitlab.com/test-frontend.git (404)
      expect(isNamespacedRepoPath('test-frontend')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isNamespacedRepoPath('')).toBe(false);
    });
  });
});
