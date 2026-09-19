import type { SourceProviderOption } from "@/features/projects/types/project";
import type {
  DiscoveredRepo,
  ManagedServiceType,
  ServiceTemplate,
} from "@/features/projects/types/service";
import type {
  AppMode,
  ServiceKind,
  Step,
} from "@/features/projects/components/add-service-wizard.catalog";

export type WizardState = {
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

export const initialWizardState: WizardState = {
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

export type SetFieldAction = {
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

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "RESET": {
      const next = { ...state };
      for (const field of RESET_FIELDS) {
        (next as Record<string, unknown>)[field] = initialWizardState[field];
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
      return {
        ...state,
        platform: action.platform,
        providerId: action.providerId,
      };
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
        selected: new Set(action.repos.map((repo) => repo.repoPath)),
      };
    default:
      return state;
  }
}
