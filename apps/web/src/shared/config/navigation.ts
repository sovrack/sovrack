import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ClipboardList,
  Database,
  FolderGit2,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Rocket,
  Server,
  Settings,
  TerminalSquare,
  Wrench,
  Users,
} from 'lucide-react';

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export type AppNavSection = {
  id: 'overview' | 'deliver' | 'infrastructure' | 'settings';
  label: string;
  items: AppNavItem[];
};

// IA en 4 piliers : Overview · Delivery · Infrastructure · Settings.
// - Pipelines n'est plus un item de 1er niveau : c'est un SOUS-ONGLET de
//   Deployments (SubNav), pour lever le chevauchement Deployments/Pipelines.
// - Servers / Registry / SSH Keys / Terminal sont regroupés sous Infrastructure
//   (ce sont des cibles/outils d'infra, pas des « réglages »).
export const APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    id: 'deliver',
    label: 'Delivery',
    items: [
      { href: '/projects', label: 'Projects', icon: FolderGit2 },
      { href: '/deployments', label: 'Deployments', icon: Rocket },
      { href: '/automation', label: 'Automation', icon: Wrench, adminOnly: true },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    items: [
      { href: '/admin/servers', label: 'Servers', icon: Server, adminOnly: true },
      { href: '/settings/registry', label: 'Registry', icon: Database, adminOnly: true },
      { href: '/settings/ssh-keys', label: 'SSH Keys', icon: KeyRound },
      { href: '/terminal', label: 'Terminal', icon: TerminalSquare, adminOnly: true },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { href: '/settings', label: 'Platform Settings', icon: Settings, adminOnly: true },
      { href: '/settings/git', label: 'Git Providers', icon: GitBranch, adminOnly: true },
      { href: '/admin/users', label: 'Users & Teams', icon: Users, adminOnly: true },
      { href: '/settings/status', label: 'System Status', icon: Activity, adminOnly: true },
      { href: '/settings/audit-logs', label: 'Audit Logs', icon: ClipboardList, adminOnly: true },
    ],
  },
];

export function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

