'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { getApiErrorMessage } from '@/lib/api';
import { projectsService } from '@/services/projects.service';
import type {
  ConnectGitlabPayload,
  GitlabBranch,
  GitlabConfig,
  GitlabPipeline,
  GitlabProviderOption,
  GitlabRepo,
  GitlabSourceType,
  ProjectDetail,
} from '@/types/project';

type UseProjectGitlabParams = {
  projectId: string;
  project: ProjectDetail | null;
  refreshProject: () => Promise<void>;
};

export function useProjectGitlab({
  projectId,
  project,
  refreshProject,
}: UseProjectGitlabParams) {
  const [gitlabConfig, setGitlabConfig] = useState<GitlabConfig | null>(null);
  const [branches, setBranches] = useState<GitlabBranch[]>([]);
  const [pipelines, setPipelines] = useState<GitlabPipeline[]>([]);
  const [repos, setRepos] = useState<GitlabRepo[]>([]);
  const [providers, setProviders] = useState<GitlabProviderOption[]>([]);
  const [gitlabLoading, setGitlabLoading] = useState(false);
  const [gitlabError, setGitlabError] = useState<string | null>(null);
  const [gitlabSubmitting, setGitlabSubmitting] = useState(false);
  const [pipelineSubmitting, setPipelineSubmitting] = useState(false);

  const [gitlabUrl, setGitlabUrl] = useState('');
  const [gitlabToken, setGitlabToken] = useState('');
  const [gitlabProjectId, setGitlabProjectId] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [providerId, setProviderId] = useState('');
  const [sourceType, setSourceType] = useState<GitlabSourceType>('REPO');
  const [gitlabGroupId, setGitlabGroupId] = useState('');
  const [deployTokenUsername, setDeployTokenUsername] = useState('');
  const [deployTokenValue, setDeployTokenValue] = useState('');
  const [registryUrl, setRegistryUrl] = useState('');
  const loadedProjectRef = useRef<string | null>(null);

  const loadProviders = useCallback(async (): Promise<GitlabProviderOption[]> => {
    try {
      const nextProviders = await projectsService.getGitlabProviders();
      setProviders(nextProviders);
      return nextProviders;
    } catch {
      setProviders([]);
      return [];
    }
  }, []);

  const loadGitlabData = useCallback(async () => {
    setGitlabLoading(true);
    setGitlabError(null);
    const availableProviders = await loadProviders();
    const defaultProviderId =
      availableProviders.find((provider) => provider.isDefault)?.id ??
      availableProviders[0]?.id ??
      '';

    try {
      const config = await projectsService.getGitlabConfig(projectId);
      setGitlabConfig(config);
      setSourceType(config.sourceType);
      setProviderId(config.providerId ?? defaultProviderId);
      setGitlabUrl(config.gitlabUrl);
      setGitlabProjectId(config.gitlabId ? String(config.gitlabId) : '');
      setGitlabGroupId(config.gitlabGroupId ? String(config.gitlabGroupId) : '');
      setDefaultBranch(config.defaultBranch || 'main');
      setSelectedBranch(config.defaultBranch || 'main');
      setDeployTokenUsername(config.deployTokenUsername ?? '');
      setRegistryUrl(config.registryUrl ?? '');

      if (config.sourceType === 'GROUP') {
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
        message.includes('Configuration GitLab non trouvée') ||
        message.includes('404');

      if (isMissingConfig) {
        setGitlabConfig(null);
        setProviderId(defaultProviderId);
        setBranches([]);
        setPipelines([]);
        setRepos([]);
        setGitlabError(null);
      } else {
        setGitlabConfig(null);
        setProviderId(defaultProviderId);
        setBranches([]);
        setPipelines([]);
        setRepos([]);
        setGitlabError(message);
      }
    } finally {
      setGitlabLoading(false);
    }
  }, [projectId, loadProviders]);

  useEffect(() => {
    if (!project) {
      return;
    }

    setGitlabUrl(project.gitlabUrl ?? '');
    setGitlabProjectId(project.gitlabId ? String(project.gitlabId) : '');
    setDefaultBranch(project.branch ?? 'main');
    setSelectedBranch(project.branch ?? 'main');
  }, [project]);

  useEffect(() => {
    if (loadedProjectRef.current === projectId) {
      return;
    }
    loadedProjectRef.current = projectId;
    void loadGitlabData();
  }, [loadGitlabData, projectId]);

  const handleConnectGitlab = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGitlabError(null);

    let parsedRepoId: number | undefined;
    let parsedGroupId: number | undefined;

    if (sourceType === 'REPO') {
      const repoId = Number(gitlabProjectId);
      if (!Number.isFinite(repoId) || repoId <= 0) {
        setGitlabError('GitLab Project ID invalide.');
        return;
      }
      parsedRepoId = repoId;
    } else {
      const groupId = Number(gitlabGroupId);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        setGitlabError('GitLab Group ID invalide.');
        return;
      }
      parsedGroupId = groupId;
    }

    const payload: ConnectGitlabPayload = {
      gitlabUrl: gitlabUrl.trim() || undefined,
      gitlabToken: gitlabToken.trim() || undefined,
      providerId: providerId.trim() || undefined,
      defaultBranch: defaultBranch.trim() || 'main',
      sourceType,
      gitlabId: parsedRepoId,
      gitlabGroupId: parsedGroupId,
      deployTokenUsername: deployTokenUsername.trim() || undefined,
      deployTokenValue: deployTokenValue.trim() || undefined,
      registryUrl: registryUrl.trim() || undefined,
    };

    setGitlabSubmitting(true);
    try {
      await projectsService.connectGitlab(projectId, payload);
      setGitlabToken('');
      setDeployTokenValue('');
      await refreshProject();
      await loadGitlabData();
    } catch (error) {
      setGitlabError(getApiErrorMessage(error));
    } finally {
      setGitlabSubmitting(false);
    }
  };

  const handleTriggerPipeline = async () => {
    if (sourceType === 'GROUP') {
      return;
    }

    setPipelineSubmitting(true);
    setGitlabError(null);

    try {
      await projectsService.triggerPipeline(projectId, selectedBranch);
      await loadGitlabData();
    } catch (error) {
      setGitlabError(getApiErrorMessage(error));
    } finally {
      setPipelineSubmitting(false);
    }
  };

  return {
    gitlabConfig,
    branches,
    pipelines,
    repos,
    gitlabLoading,
    gitlabError,
    gitlabSubmitting,
    pipelineSubmitting,
    gitlabUrl,
    setGitlabUrl,
    gitlabToken,
    setGitlabToken,
    gitlabProjectId,
    setGitlabProjectId,
    defaultBranch,
    setDefaultBranch,
    selectedBranch,
    setSelectedBranch,
    sourceType,
    setSourceType,
    providers,
    providerId,
    setProviderId,
    gitlabGroupId,
    setGitlabGroupId,
    deployTokenUsername,
    setDeployTokenUsername,
    deployTokenValue,
    setDeployTokenValue,
    registryUrl,
    setRegistryUrl,
    loadProviders,
    loadGitlabData,
    handleConnectGitlab,
    handleTriggerPipeline,
  };
}

export type UseProjectGitlabReturn = ReturnType<typeof useProjectGitlab>;
