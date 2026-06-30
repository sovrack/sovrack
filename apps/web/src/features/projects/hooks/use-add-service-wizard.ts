"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "@/shared/lib/api";
import { projectsService } from "@/features/projects/api/projects.service";
import { servicesService } from "@/features/projects/api/services.service";
import type { SourceProviderOption } from "@/features/projects/types/project";
import type {
  CreateServicePayload,
  DiscoveredRepo,
  ManagedServiceType,
  ServiceTemplate,
} from "@/features/projects/types/service";
import {
  repoToName,
  normalizeRepoPath,
  type ServiceKind,
  type AppMode,
  type Step,
} from "@/features/projects/components/add-service-wizard.catalog";

export type UseAddServiceWizardParams = {
  projectId: string;
  open: boolean;
  initialKind?: ServiceKind;
  onCreated: () => void;
  onClose: () => void;
};

export function useAddServiceWizard({
  projectId,
  open,
  initialKind,
  onCreated,
  onClose,
}: UseAddServiceWizardParams) {
  const [step, setStep] = useState<Step>(1);
  const [kind, setKind] = useState<ServiceKind | null>(null);
  const [appMode, setAppMode] = useState<AppMode>("repo");
  const [platform, setPlatform] = useState<"GITLAB" | "GITHUB" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [providers, setProviders] = useState<SourceProviderOption[]>([]);
  const [providerId, setProviderId] = useState("");

  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [branch, setBranch] = useState("main");
  const [port, setPort] = useState("3000");

  const [groupPath, setGroupPath] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [databaseType, setDatabaseType] = useState<ManagedServiceType>("POSTGRES");
  const [databaseVersion, setDatabaseVersion] = useState("16");
  const [image, setImage] = useState("");
  const [composeContent, setComposeContent] = useState("");

  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === providerId) ?? null,
    [providers, providerId],
  );

  const reset = useCallback(() => {
    setStep(1);
    setKind(null);
    setAppMode("repo");
    setPlatform(null);
    setError(null);
    setSubmitting(false);
    setName("");
    setToken("");
    setRepoPath("");
    setBranch("main");
    setPort("3000");
    setGroupPath("");
    setDiscovered([]);
    setSelected(new Set());
    setDatabaseType("POSTGRES");
    setDatabaseVersion("16");
    setImage("");
    setComposeContent("");
    setTemplates([]);
    setTemplateId("");
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    if (initialKind) {
      setKind(initialKind);
      setStep(2);
      if (initialKind === "TEMPLATE") {
        servicesService
          .listTemplates(projectId)
          .then((list) => {
            setTemplates(list);
            if (list[0]) setTemplateId(list[0].id);
          })
          .catch(() => setTemplates([]));
      }
    }
    projectsService
      .getSourceProviders()
      .then((list) => {
        setProviders(list);
        const def = list.find((p) => p.isDefault) ?? list[0];
        if (def) setProviderId(def.id);
      })
      .catch(() => setProviders([]));
  }, [open, reset, initialKind, projectId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pickKind = (k: ServiceKind) => {
    setKind(k);
    setPlatform(null);
    setError(null);
    setStep(2);
    if (k === "TEMPLATE") {
      servicesService
        .listTemplates(projectId)
        .then((list) => {
          setTemplates(list);
          if (list[0]) setTemplateId(list[0].id);
        })
        .catch((e: unknown) => setError(getApiErrorMessage(e)));
    }
  };

  const pickPlatform = (p: "GITLAB" | "GITHUB") => {
    setPlatform(p);
    const match = providers.filter((x) => x.type === p);
    setProviderId(match.find((x) => x.isDefault)?.id ?? match[0]?.id ?? "");
  };

  const discover = async () => {
    if (
      !selectedProvider ||
      !groupPath.trim() ||
      (!token.trim() && selectedProvider.status !== "CONFIGURED")
    ) {
      setError(
        "Provider and group/org path required (plus a token if the provider is not connected).",
      );
      return;
    }
    setDiscovering(true);
    setError(null);
    try {
      const repos = await servicesService.discoverGroup(projectId, {
        provider: selectedProvider.type as "GITLAB" | "GITHUB",
        groupPath: groupPath.trim(),
        token: token.trim(),
        providerId: selectedProvider.id,
      });
      setDiscovered(repos);
      setSelected(new Set(repos.map((r) => r.repoPath)));
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setDiscovering(false);
    }
  };

  const toggleRepo = (rp: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rp)) next.delete(rp);
      else next.add(rp);
      return next;
    });

  const canReview = (() => {
    if (kind === "APPLICATION") {
      if (appMode === "group") return selected.size > 0;
      return Boolean(
        selectedProvider &&
          repoPath.trim() &&
          (token.trim() || selectedProvider.status === "CONFIGURED"),
      );
    }
    if (kind === "DATABASE") return name.trim().length > 0;
    if (kind === "DOCKER") return Boolean(name.trim() && image.trim());
    if (kind === "COMPOSE") return Boolean(name.trim() && composeContent.trim());
    if (kind === "TEMPLATE") return Boolean(selectedTemplate && name.trim());
    return false;
  })();

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (kind === "APPLICATION" && selectedProvider && appMode === "repo") {
        const provider = selectedProvider.type as "GITLAB" | "GITHUB";
        const normalizedPath = normalizeRepoPath(repoPath);
        const payload: CreateServicePayload = {
          name: name.trim() || repoToName(normalizedPath),
          type: "APPLICATION",
          sourceType: "GIT",
          repoPath: normalizedPath,
          branch: branch.trim() || "main",
          providerId: selectedProvider.id,
          port: Number(port) || undefined,
          ...(token.trim()
            ? {
                source: {
                  provider,
                  repoPath: normalizedPath,
                  token: token.trim(),
                  branch: branch.trim() || "main",
                },
              }
            : {}),
        };
        await servicesService.create(projectId, payload);
      } else if (kind === "APPLICATION" && selectedProvider && appMode === "group") {
        const provider = selectedProvider.type as "GITLAB" | "GITHUB";
        const repos = discovered.filter((r) => selected.has(r.repoPath));
        for (const repo of repos) {
          await servicesService.create(projectId, {
            name: repoToName(repo.repoPath),
            type: "APPLICATION",
            sourceType: "GIT",
            repoPath: repo.repoPath,
            branch: repo.defaultBranch || "main",
            providerId: selectedProvider.id,
            ...(token.trim()
              ? {
                  source: {
                    provider,
                    repoPath: repo.repoPath,
                    token: token.trim(),
                    branch: repo.defaultBranch || "main",
                  },
                }
              : {}),
          });
        }
      } else if (kind === "DATABASE") {
        await servicesService.create(projectId, {
          name: name.trim(),
          type: "DATABASE",
          databaseType,
          databaseVersion: databaseVersion.trim() || "latest",
        });
      } else if (kind === "DOCKER") {
        await servicesService.create(projectId, {
          name: name.trim(),
          type: "APPLICATION",
          sourceType: "DOCKER_IMAGE",
          repoPath: image.trim(),
          buildPack: "NONE",
          port: Number(port) || undefined,
        });
      } else if (kind === "COMPOSE") {
        await servicesService.create(projectId, {
          name: name.trim(),
          type: "APPLICATION",
          sourceType: "NONE",
          buildPack: "DOCKER_COMPOSE",
          dockerComposeContent: composeContent,
        });
      } else if (kind === "TEMPLATE" && selectedTemplate) {
        await servicesService.createFromTemplate(
          projectId,
          selectedTemplate.id,
          name.trim(),
        );
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    step,
    setStep,
    kind,
    appMode,
    setAppMode,
    platform,
    setPlatform,
    error,
    submitting,
    providers,
    providerId,
    setProviderId,
    name,
    setName,
    token,
    setToken,
    repoPath,
    setRepoPath,
    branch,
    setBranch,
    port,
    setPort,
    groupPath,
    setGroupPath,
    discovering,
    discovered,
    selected,
    setSelected,
    databaseType,
    setDatabaseType,
    databaseVersion,
    setDatabaseVersion,
    image,
    setImage,
    composeContent,
    setComposeContent,
    templates,
    templateId,
    setTemplateId,
    selectedTemplate,
    selectedProvider,
    canReview,
    pickKind,
    pickPlatform,
    discover,
    toggleRepo,
    submit,
  };
}

export type UseAddServiceWizardReturn = ReturnType<typeof useAddServiceWizard>;
