/**
 * Forme brute d'un pipeline GitLab (snake_case, telle que renvoyée par
 * l'API GitLab). Placé dans contracts/ (plutôt que dans l'adapter gitlab/)
 * pour permettre son import depuis webhooks/ sans creuser un import
 * profond dans source-providers/adapters/gitlab/gitlab.client.ts — voir
 * EXPLORATION_GIT_BUILD_WEBHOOKS.md Sujet 3.
 */
export type GitlabPipelineItem = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
};
