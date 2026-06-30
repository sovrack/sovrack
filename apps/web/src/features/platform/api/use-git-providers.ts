"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { platformConfigService } from "@/features/platform/api/platform-config.service";
import type { GitlabProvider } from "@/features/platform/types/platform-config";

export const gitProvidersKey = ["git-providers"] as const;

/**
 * Liste unifiée des providers Git (GitLab + GitHub + Gitea). `allSettled` →
 * un provider en panne n'empêche pas d'afficher les autres.
 */
export function useGitProviders() {
  return useQuery({
    queryKey: gitProvidersKey,
    queryFn: async (): Promise<GitlabProvider[]> => {
      const [gitlabList, githubList, giteaList] = await Promise.allSettled([
        platformConfigService.listGitlabProviders(),
        platformConfigService.listGithubProviders(),
        platformConfigService.listGiteaProviders(),
      ]);
      const gitlab =
        gitlabList.status === "fulfilled"
          ? gitlabList.value.map((p) => ({
              ...p,
              providerType: "GITLAB" as const,
            }))
          : [];
      const github =
        githubList.status === "fulfilled"
          ? githubList.value.map((p) => ({
              ...p,
              providerType: "GITHUB" as const,
            }))
          : [];
      const gitea =
        giteaList.status === "fulfilled"
          ? giteaList.value.map((p) => ({
              ...p,
              providerType: "GITEA" as const,
            }))
          : [];
      return [...gitlab, ...github, ...gitea];
    },
  });
}

/** Hook compagnon : invalide la liste des providers (à appeler après une mutation). */
export function useReloadGitProviders() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: gitProvidersKey });
}
