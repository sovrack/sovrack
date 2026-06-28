import {
  Container,
  Database,
  FolderGit2,
  Layers,
  Package,
} from 'lucide-react';
import type { ManagedServiceType } from '@/features/projects/types/service';

// Catalogue + helpers du wizard d'ajout de service. Extrait du composant pour
// le garder focalisé sur le flux (3 étapes) ; ces données/utilitaires sont purs.

export type ServiceKind =
  | 'APPLICATION'
  | 'DATABASE'
  | 'DOCKER'
  | 'COMPOSE'
  | 'TEMPLATE';
export type AppMode = 'repo' | 'group';
export type Step = 1 | 2 | 3;

export const KINDS: {
  kind: ServiceKind;
  label: string;
  hint: string;
  icon: React.ReactNode;
  // Shown but not selectable: the deploy executor does not yet expand a
  // docker-compose stack into multiple containers, so offering it would
  // create services that never deploy. Re-enable once the compose executor lands.
  disabled?: boolean;
  badge?: string;
}[] = [
  { kind: 'APPLICATION', label: 'Application', hint: 'Deploy from a Git repo or import a whole group (GitLab / GitHub / Gitea)', icon: <FolderGit2 size={20} /> },
  { kind: 'DATABASE', label: 'Database', hint: 'PostgreSQL, MySQL, Redis, MongoDB, RabbitMQ', icon: <Database size={20} /> },
  { kind: 'DOCKER', label: 'Docker image', hint: 'Deploy a prebuilt image from a registry', icon: <Container size={20} /> },
  { kind: 'COMPOSE', label: 'Docker Compose', hint: 'Multi-service stacks are under development — use multiple Application/Docker services for now', icon: <Layers size={20} />, disabled: true, badge: 'Coming soon' },
  { kind: 'TEMPLATE', label: 'Template', hint: 'One-click bundles (e.g. PostgreSQL + pgAdmin), pre-wired together', icon: <Package size={20} /> },
];

export const DATABASES: {
  type: ManagedServiceType;
  label: string;
  defaultVersion: string;
}[] = [
  { type: 'POSTGRES', label: 'PostgreSQL', defaultVersion: '16' },
  { type: 'MYSQL', label: 'MySQL', defaultVersion: '8' },
  { type: 'REDIS', label: 'Redis', defaultVersion: '7' },
  { type: 'MONGODB', label: 'MongoDB', defaultVersion: '7' },
  { type: 'RABBITMQ', label: 'RabbitMQ', defaultVersion: '3' },
];

export function repoToName(repoPath: string): string {
  const seg = repoPath.trim().replace(/\/+$/, '').split('/').pop() ?? '';
  return seg || repoPath.trim();
}

/**
 * Accepts a full git URL or a short path and returns only the path segment.
 * e.g. https://gitlab.com/group/repo.git  →  group/repo
 *      git@github.com:group/repo.git      →  group/repo
 *      group/repo                         →  group/repo
 */
export function normalizeRepoPath(input: string): string {
  const s = input.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  try {
    const url = new URL(s);
    return url.pathname.replace(/^\/+/, '');
  } catch {
    if (s.includes('@') && s.includes(':')) {
      return s.split(':').slice(1).join(':');
    }
    return s.replace(/^\/+/, '');
  }
}
