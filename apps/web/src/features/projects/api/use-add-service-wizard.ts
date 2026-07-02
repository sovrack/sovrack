"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
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

/* ─── State + reducer ──────────────────────────────────────────────────────
 * The 23 pieces of wizard state were previously 23 independent useState
 * calls. Consolidated into one WizardState + a reducer so every transition
 * (reset on open, pick-kind, pick-platform, discover, submit) updates
 * related fields atomically instead of via several sequential setState
 * calls. The hook's returned API (flat values + setters) is unchanged so
 * AddServiceWizard needs no changes. */

type WizardState = {
  step: Step;
  kind: ServiceKind | null;
  appMode: AppMode;
  platform: "GITLAB" | "GITHUB" | null;
  error: string | null;
  submitting: boolean;
  providers: SourceProviderOption[];
  providerId: string;
  name: string;
  token: string;
  repoPath: string;
  branch: string;
  port: string;
  groupPath: string;
  discovering: boolean;
  discovered: DiscoveredRepo[];
  selected: Set<string>;
  databaseType: ManagedServiceType;
  databaseVersion: string;
  image: string;
  composeContent: string;
  templates: ServiceTemplate[];
  templateId: string;
};

const initialState: WizardState = {
  step: 1,
  kind: null,
  appMode: "repo",
  platform: null,
  error: null,
  submitting: false,
  providers: [],
  providerId: "",
  name: "",
  token: "",
  repoPath: "",
  branch: "main",
  port: "3000",
  groupPath: "",
  discovering: false,
  discovered: [],
  selected: new Set(),
  databaseType: "POSTGRES",
  databaseVersion: "16",
  image: "",
  composeContent: "",
  templates: [],
  templateId: "",
};

// Fields touched by reset() in the original hook — deliberately excludes
// providers/providerId/discovering, which the original reset() also left
// untouched (providers/providerId get overwritten by the unconditional
// getSourceProviders() fetch that follows; discovering was simply never
// part of reset()).
const RESET_FIELDS = [
  "step",
  "kind",
  "appMode",
  "platform",
  "error",
  "submitting",
  "name",
  "token",
  "repoPath",
  "branch",
  "port",
  "groupPath",
  "discovered",
  "selected",
  "databaseType",
  "databaseVersion",
  "image",
  "composeContent",
  "templates",
  "templateId",
] as const satisfies readonly (keyof WizardState)[];

type SetFieldAction = {
  [K in keyof WizardState]: {
    type: "SET_FIELD";
    field: K;
    value: WizardState[K];
  };
}[keyof WizardState];

type WizardAction =
  | SetFieldAction
  | { type: "RESET" }
  | { type: "PICK_KIND"; kind: ServiceKind }
  | { type: "PICK_PLATFORM"; platform: "GITLAB" | "GITHUB"; providerId: string }
  | { type: "TOGGLE_REPO"; repoPath: string }
  | { type: "DISCOVER_SUCCESS"; repos: DiscoveredRepo[] };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "RESET": {
      const next = { ...state };
      for (const field of RESET_FIELDS) {
        (next as Record<string, unknown>)[field] = initialState[field];
      }
      return next;
    }
    case "PICK_KIND":
      return {
        ...state,
        kind: action.kind,
        platform: null,
        error: null,
        step: 2,
      };
    case "PICK_PLATFORM":
      return { ...state, platform: action.platform, providerId: action.providerId };
    case "TOGGLE_REPO": {
      const next = new Set(state.selected);
      if (next.has(action.repoPath)) next.delete(action.repoPath);
      else next.add(action.repoPath);
      return { ...state, selected: next };
    }
    case "DISCOVER_SUCCESS":
      return {
        ...state,
        discovering: false,
        discovered: action.repos,
        selected: new Set(action.repos.map((r) => r.repoPath)),
      };
    default:
      return state;
  }
}

export function useAddServiceWizard({
  projectId,
  open,
  initialKind,
  onCreated,
  onClose,
}: UseAddServiceWizardParams) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  const {
    step,
    kind,
    appMode,
    platform,
    error,
    submitting,
    providers,
    providerId,
    name,
    token,
    repoPath,
    branch,
    port,
    groupPath,
    discovering,
    discovered,
    selected,
    databaseType,
    databaseVersion,
    image,
    composeContent,
    templates,
    templateId,
  } = state;

  const setField = useCallback(
    <K extends keyof WizardState>(field: K, value: WizardState[K]) => {
      dispatch({ type: "SET_FIELD", field, value } as SetFieldAction);
    },
    [],
  );

  const setStep = useCallback((v: Step) => setField("step", v), [setField]);
  const setAppMode = useCallback((v: AppMode) => setField("appMode", v), [setField]);
  const setPlatform = useCallback(
    (v: "GITLAB" | "GITHUB" | null) => setField("platform", v),
    [setField],
  );
  const setProviderId = useCallback((v: string) => setField("providerId", v), [setField]);
  const setName = useCallback((v: string) => setField("name", v), [setField]);
  const setToken = useCallback((v: string) => setField("token", v), [setField]);
  const setRepoPath = useCallback((v: string) => setField("repoPath", v), [setField]);
  const setBranch = useCallback((v: string) => setField("branch", v), [setField]);
  const setPort = useCallback((v: string) => setField("port", v), [setField]);
  const setGroupPath = useCallback((v: string) => setField("groupPath", v), [setField]);
  const setSelected = useCallback(
    (v: Set<string> | ((prev: Set<string>) => Set<string>)) =>
      dispatch({
        type: "SET_FIELD",
        field: "selected",
        value: typeof v === "function" ? v(state.selected) : v,
      }),
    [state.selected],
  );
  const setDatabaseType = useCallback(
    (v: ManagedServiceType) => setField("databaseType", v),
    [setField],
  );
  const setDatabaseVersion = useCallback(
    (v: string) => setField("databaseVersion", v),
    [setField],
  );
  const setImage = useCallback((v: string) => setField("image", v), [setField]);
  const setComposeContent = useCallback(
    (v: string) => setField("composeContent", v),
    [setField],
  );
  const setTemplateId = useCallback((v: string) => setField("templateId", v), [setField]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === providerId) ?? null,
    [providers, providerId],
  );

  useEffect(() => {
    if (!open) return;
    dispatch({ type: "RESET" });
    if (initialKind) {
      dispatch({ type: "SET_FIELD", field: "kind", value: initialKind });
      dispatch({ type: "SET_FIELD", field: "step", value: 2 });
      if (initialKind === "TEMPLATE") {
        servicesService
          .listTemplates(projectId)
          .then((list) => {
            dispatch({ type: "SET_FIELD", field: "templates", value: list });
            if (list[0])
              dispatch({ type: "SET_FIELD", field: "templateId", value: list[0].id });
          })
          .catch(() => dispatch({ type: "SET_FIELD", field: "templates", value: [] }));
      }
    }
    projectsService
      .getSourceProviders()
      .then((list) => {
        dispatch({ type: "SET_FIELD", field: "providers", value: list });
        const def = list.find((p) => p.isDefault) ?? list[0];
        if (def) dispatch({ type: "SET_FIELD", field: "providerId", value: def.id });
      })
      .catch(() => dispatch({ type: "SET_FIELD", field: "providers", value: [] }));
  }, [open, initialKind, projectId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pickKind = (k: ServiceKind) => {
    dispatch({ type: "PICK_KIND", kind: k });
    if (k === "TEMPLATE") {
      servicesService
        .listTemplates(projectId)
        .then((list) => {
          dispatch({ type: "SET_FIELD", field: "templates", value: list });
          if (list[0])
            dispatch({ type: "SET_FIELD", field: "templateId", value: list[0].id });
        })
        .catch((e: unknown) =>
          dispatch({ type: "SET_FIELD", field: "error", value: getApiErrorMessage(e) }),
        );
    }
  };

  const pickPlatform = (p: "GITLAB" | "GITHUB") => {
    const match = providers.filter((x) => x.type === p);
    dispatch({
      type: "PICK_PLATFORM",
      platform: p,
      providerId: match.find((x) => x.isDefault)?.id ?? match[0]?.id ?? "",
    });
  };

  const discover = async () => {
    if (
      !selectedProvider ||
      !groupPath.trim() ||
      (!token.trim() && selectedProvider.status !== "CONFIGURED")
    ) {
      dispatch({
        type: "SET_FIELD",
        field: "error",
        value:
          "Provider and group/org path required (plus a token if the provider is not connected).",
      });
      return;
    }
    dispatch({ type: "SET_FIELD", field: "discovering", value: true });
    dispatch({ type: "SET_FIELD", field: "error", value: null });
    try {
      const repos = await servicesService.discoverGroup(projectId, {
        provider: selectedProvider.type as "GITLAB" | "GITHUB",
        groupPath: groupPath.trim(),
        token: token.trim(),
        providerId: selectedProvider.id,
      });
      dispatch({ type: "DISCOVER_SUCCESS", repos });
    } catch (e) {
      dispatch({ type: "SET_FIELD", field: "error", value: getApiErrorMessage(e) });
      dispatch({ type: "SET_FIELD", field: "discovering", value: false });
    }
  };

  const toggleRepo = (rp: string) => dispatch({ type: "TOGGLE_REPO", repoPath: rp });

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
    dispatch({ type: "SET_FIELD", field: "error", value: null });
    dispatch({ type: "SET_FIELD", field: "submitting", value: true });
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
      dispatch({ type: "SET_FIELD", field: "error", value: getApiErrorMessage(e) });
    } finally {
      dispatch({ type: "SET_FIELD", field: "submitting", value: false });
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
