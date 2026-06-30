"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiErrorMessage } from "@/shared/lib/api";
import { projectKeys } from "@/features/projects/api/project-query-keys";
import { projectsService } from "@/features/projects/api/projects.service";
import type {
  ConnectGitlabPayload,
  GitlabBranch,
  GitlabConfig,
  GitlabPipeline,
  GitlabProviderOption,
  GitlabRepo,
  ProjectDetail,
} from "@/features/projects/types/project";

type ProjectSourceConfig = GitlabConfig;
type ProjectSourceRepo = GitlabRepo;
type ProjectSourceBranch = GitlabBranch;

type UseProjectSourceParams = {
  projectId: string;
  project?: ProjectDetail | null;
};

export function useProjectSource({
  projectId,
}: UseProjectSourceParams) {
  const queryClient = useQueryClient();
  const [sourceConfig, setSourceConfig] = useState<ProjectSourceConfig | null>(
    null,
  );
  const [branches, setBranches] = useState<ProjectSourceBranch[]>([]);
  const [pipelines, setPipelines] = useState<GitlabPipeline[]>([]);
  const [repos, setRepos] = useState<ProjectSourceRepo[]>([]);
  const [providers, setProviders] = useState<GitlabProviderOption[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceSubmitting, setSourceSubmitting] = useState(false);
  const [pipelineSubmitting, setPipelineSubmitting] = useState(false);

  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceToken, setSourceToken] = useState("");
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [providerId, setProviderId] = useState("");
  const [sourceType, setSourceType] = useState<"REPO" | "GROUP">("REPO");
  const [sourceGroupId, setSourceGroupId] = useState("");
  const [deployTokenUsername, setDeployTokenUsername] = useState("");
  const [deployTokenValue, setDeployTokenValue] = useState("");
  const [registryUrl, setRegistryUrl] = useState("");
  const loadedProjectRef = useRef<string | null>(null);

  const loadProviders = useCallback(async (): Promise<
    GitlabProviderOption[]
  > => {
    try {
      const nextProviders = await projectsService.getGitlabProviders();
      setProviders(nextProviders);
      return nextProviders;
    } catch {
      setProviders([]);
      return [];
    }
  }, []);

  const loadSourceData = useCallback(async () => {
    setSourceLoading(true);
    setSourceError(null);
    const availableProviders = await loadProviders();
    const defaultProviderId =
      availableProviders.find((provider) => provider.isDefault)?.id ??
      availableProviders[0]?.id ??
      "";

    try {
      const config = await projectsService.getSourceConfig(projectId);
      setSourceConfig(config);
      setSourceType((config.sourceType as "REPO" | "GROUP") ?? "REPO");
      setProviderId(config.providerId ?? defaultProviderId);
      setSourceUrl(config.gitlabUrl);
      setSourceProjectId(config.gitlabId ? String(config.gitlabId) : "");
      setSourceGroupId(
        config.gitlabGroupId ? String(config.gitlabGroupId) : "",
      );
      setDefaultBranch(config.defaultBranch || "main");
      setSelectedBranch(config.defaultBranch || "main");
      setDeployTokenUsername(config.deployTokenUsername ?? "");
      setRegistryUrl(config.registryUrl ?? "");

      if (config.sourceType === "GROUP") {
        if (!config.gitlabGroupId) {
          setRepos([]);
          setBranches([]);
          setPipelines([]);
          return;
        }
        const nextRepos = await projectsService.getRepos(projectId);
        setRepos(nextRepos);
        setBranches([]);
        setPipelines([]);
      } else {
        if (!config.gitlabId) {
          setBranches([]);
          setPipelines([]);
          setRepos([]);
          return;
        }
        const [nextBranches, nextPipelines] = await Promise.all([
          projectsService.getBranches(projectId),
          projectsService.getPipelines(projectId),
        ]);
        setBranches(nextBranches);
        setPipelines(nextPipelines);
        setRepos([]);
      }
    } catch (error) {
      const message = getApiErrorMessage(error);
      const isMissingConfig =
        message.includes("Configuration GitLab non trouvée") ||
        message.includes("404");

      if (isMissingConfig) {
        setSourceConfig(null);
        setProviderId(defaultProviderId);
        setBranches([]);
        setPipelines([]);
        setRepos([]);
        setSourceError(null);
      } else {
        setSourceConfig(null);
        setProviderId(defaultProviderId);
        setBranches([]);
        setPipelines([]);
        setRepos([]);
        setSourceError(message);
      }
    } finally {
      setSourceLoading(false);
    }
  }, [projectId, loadProviders]);

  useEffect(() => {
    if (loadedProjectRef.current === projectId) {
      return;
    }
    loadedProjectRef.current = projectId;
    void loadSourceData();
  }, [loadSourceData, projectId]);

  const handleConnectSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSourceError(null);

    let repoIdentifier: string | undefined;
    let parsedGroupId: number | undefined;

    if (sourceType === "REPO") {
      repoIdentifier = String(sourceProjectId).trim();
      if (!repoIdentifier) {
        setSourceError(
          'Repository required ("group/project" path or numeric ID).',
        );
        return;
      }
    } else {
      const groupId = Number(sourceGroupId);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        setSourceError("GitLab Group ID invalide.");
        return;
      }
      parsedGroupId = groupId;
    }

    const payload: ConnectGitlabPayload = {
      gitlabUrl: sourceUrl.trim() || undefined,
      gitlabToken: sourceToken.trim() || undefined,
      providerId: providerId.trim() || undefined,
      defaultBranch: defaultBranch.trim() || "main",
      sourceType,
      gitlabId: repoIdentifier,
      gitlabGroupId: parsedGroupId,
      deployTokenUsername: deployTokenUsername.trim() || undefined,
      deployTokenValue: deployTokenValue.trim() || undefined,
      registryUrl: registryUrl.trim() || undefined,
    };

    setSourceSubmitting(true);
    try {
      await projectsService.connectSourceConfig(projectId, payload);
      setSourceToken("");
      setDeployTokenValue("");
      await queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      });
      await loadSourceData();
    } catch (error) {
      setSourceError(getApiErrorMessage(error));
    } finally {
      setSourceSubmitting(false);
    }
  };

  const handleTriggerPipeline = async () => {
    if (sourceType === "GROUP") {
      return;
    }

    setPipelineSubmitting(true);
    setSourceError(null);

    try {
      await projectsService.triggerPipeline(projectId, selectedBranch);
      await loadSourceData();
    } catch (error) {
      setSourceError(getApiErrorMessage(error));
    } finally {
      setPipelineSubmitting(false);
    }
  };

  return {
    sourceConfig,
    branches,
    pipelines,
    repos,
    sourceLoading,
    sourceError,
    sourceSubmitting,
    pipelineSubmitting,
    sourceUrl,
    setSourceUrl,
    sourceToken,
    setSourceToken,
    sourceProjectId,
    setSourceProjectId,
    defaultBranch,
    setDefaultBranch,
    selectedBranch,
    setSelectedBranch,
    sourceType,
    setSourceType,
    providers,
    providerId,
    setProviderId,
    sourceGroupId,
    setSourceGroupId,
    deployTokenUsername,
    setDeployTokenUsername,
    deployTokenValue,
    setDeployTokenValue,
    registryUrl,
    setRegistryUrl,
    loadProviders,
    loadSourceData,
    handleConnectSource,
    handleTriggerPipeline,
  };
}

export type UseProjectSourceReturn = ReturnType<typeof useProjectSource>;
export type UseProjectGitlabReturn = UseProjectSourceReturn;
