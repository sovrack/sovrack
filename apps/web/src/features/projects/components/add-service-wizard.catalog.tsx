import { Container, Database, FolderGit2, Package } from "lucide-react";
import type { ManagedServiceType } from "@/features/projects/types/service";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";

// Catalogue + helpers du wizard d'ajout de service. Extrait du composant pour
// le garder focalisé sur le flux (3 étapes) ; ces données/utilitaires sont purs.

// NB: "COMPOSE" reste dans l'union (le code des étapes/backend est conservé
// pour un futur exécuteur multi-conteneurs), mais l'option est RETIRÉE du
// catalogue de création ci-dessous (décision D3) : le moteur ne déploie qu'un
// conteneur, un service compose ne se déploierait jamais — ne pas exposer une
// fonctionnalité morte.
export type ServiceKind =
  "APPLICATION" | "DATABASE" | "DOCKER" | "COMPOSE" | "TEMPLATE";
export type AppMode = "repo" | "group";
export type Step = 1 | 2 | 3;

const ALL_KINDS: {
  kind: ServiceKind;
  label: string;
  hint: string;
  icon: React.ReactNode;
  badge?: string;
}[] = [
  {
    kind: "APPLICATION",
    label: "Application",
    hint: "Déployer un dépôt Git ou importer un groupe (GitLab / GitHub)",
    icon: <FolderGit2 size={20} />,
  },
  {
    kind: "DATABASE",
    label: "Base de données",
    hint: "PostgreSQL, MySQL, Redis, MongoDB ou RabbitMQ sur votre serveur",
    icon: <Database size={20} />,
  },
  {
    kind: "DOCKER",
    label: "Image Docker",
    hint: "Déployer une image existante depuis un registre",
    icon: <Container size={20} />,
  },
  {
    kind: "TEMPLATE",
    label: "Modèle",
    hint: "Ensembles de services préconfigurés en un clic",
    icon: <Package size={20} />,
  },
];

export const KINDS = ALL_KINDS.filter(({ kind }) => {
  if (kind === "DATABASE") return isCapabilityEnabled("managedDatabases");
  if (kind === "TEMPLATE") return isCapabilityEnabled("serviceTemplates");
  return kind !== "COMPOSE";
});

export const DATABASES: {
  type: ManagedServiceType;
  label: string;
  defaultVersion: string;
}[] = [
  { type: "POSTGRES", label: "PostgreSQL", defaultVersion: "16" },
  { type: "REDIS", label: "Redis", defaultVersion: "7" },
  { type: "MYSQL", label: "MySQL", defaultVersion: "8.0" },
  { type: "MONGODB", label: "MongoDB", defaultVersion: "7" },
  { type: "RABBITMQ", label: "RabbitMQ", defaultVersion: "3.13" },
];

export function repoToName(repoPath: string): string {
  const seg = repoPath.trim().replace(/\/+$/, "").split("/").pop() ?? "";
  return seg || repoPath.trim();
}

/**
 * Accepts a full git URL or a short path and returns only the path segment.
 * e.g. https://gitlab.com/group/repo.git  →  group/repo
 *      git@github.com:group/repo.git      →  group/repo
 *      group/repo                         →  group/repo
 */
export function normalizeRepoPath(input: string): string {
  const s = input
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  try {
    const url = new URL(s);
    return url.pathname.replace(/^\/+/, "");
  } catch {
    if (s.includes("@") && s.includes(":")) {
      return s.split(":").slice(1).join(":");
    }
    return s.replace(/^\/+/, "");
  }
}
