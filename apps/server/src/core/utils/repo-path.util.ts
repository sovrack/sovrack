/**
 * Normalizes a repository identity to a bare PATH ("owner/repo" or
 * "group/project").
 *
 * Accepts a path, a full HTTPS URL or an SSH `git@` URL and strips the
 * `scheme://host/` (or `git@host:`) prefix, surrounding slashes and a trailing
 * `.git`. This guarantees that a clone URL built as
 * `${providerUrl}/${repoPath}.git` is never doubled — the bug that broke every
 * git operation when `repoPath` accidentally held a full URL
 * (`https://gitlab.com/https://gitlab.com/group/repo`).
 *
 * Idempotent and safe for Docker image refs (no scheme → returned unchanged).
 */
export function normalizeRepoPath(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/[^/]+\//, '') // scheme://host/
    .replace(/^git@[^:]+:/, '') // git@host:
    .replace(/^\/+|\/+$/g, '') // surrounding slashes
    .replace(/\.git$/, ''); // trailing .git
}

/**
 * True when a normalized repoPath looks like a real "namespace/project"
 * (contains at least one `/`).
 *
 * GitHub and GitLab repositories always live under a user/group namespace, so a
 * bare path with no slash (e.g. "test-frontend") is a configuration mistake: the
 * clone URL `${providerUrl}/test-frontend.git` resolves to a non-existent
 * namespace and fails with a confusing "namespace could not be found" 404.
 */
export function isNamespacedRepoPath(input: string): boolean {
  const path = normalizeRepoPath(input);
  return path.length > 0 && path.includes('/');
}
