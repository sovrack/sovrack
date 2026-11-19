/**
 * Shared Git provider repository option returned by both GitHub and GitLab
 * listing services.
 */
export type GitRepoOption = {
  id: number;
  name: string;
  fullName: string;
  httpUrl: string;
  defaultBranch: string;
};
