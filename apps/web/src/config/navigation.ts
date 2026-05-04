import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ClipboardList,
  Database,
  FolderGit2,
  GitBranch,
  GitMerge,
  Hammer,
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
  id: 'operations' | 'settings';
  label: string;
  items: AppNavItem[];
};

export const APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/projects', label: 'Projects', icon: FolderGit2 },
      { href: '/builds', label: 'Builds', icon: Hammer },
      { href: '/pipelines', label: 'Pipelines', icon: GitMerge },
      { href: '/deployments', label: 'Deployments', icon: Rocket },
      { href: '/admin/servers', label: 'Remote Servers', icon: Server, adminOnly: true },
      { href: '/terminal', label: 'Terminal', icon: TerminalSquare, adminOnly: true },
      { href: '/automation', label: 'Automation', icon: Wrench, adminOnly: true },
      { href: '/monitoring', label: 'Monitoring', icon: Activity, adminOnly: true },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { href: '/settings', label: 'Platform Settings', icon: Settings },
      { href: '/settings/ssh-keys', label: 'SSH Keys', icon: KeyRound },
      { href: '/settings/git', label: 'Git Providers', icon: GitBranch, adminOnly: true },
      { href: '/settings/registry', label: 'Registry', icon: Database, adminOnly: true },
      { href: '/settings/audit-logs', label: 'Audit Logs', icon: ClipboardList, adminOnly: true },
      { href: '/admin/users', label: 'Users & Teams', icon: Users, adminOnly: true },
    ],
  },
];

export const APP_ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/projects': 'Projects',
  '/deployments': 'Deployments',
  '/pipelines': 'Pipelines',
  '/automation': 'Automation',
  '/monitoring': 'Monitoring',
  '/builds': 'Builds',
  '/terminal': 'Terminal',
  '/settings': 'Platform Settings',
  '/settings/ssh-keys': 'SSH Keys',
  '/settings/git': 'Git Providers',
  '/settings/registry': 'Registry',
  '/settings/audit-logs': 'Audit Logs',
  '/admin/users': 'Users & Teams',
  '/admin/teams': 'Users & Teams',
  '/admin/servers': 'Remote Servers',
  '/admin/settings': 'Platform Settings',
};

export function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

export function resolveRouteLabel(pathname: string): string {
  const exact = APP_ROUTE_LABELS[pathname];
  if (exact) return exact;

  const match = Object.keys(APP_ROUTE_LABELS)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname.startsWith(`${route}/`));

  return match ? APP_ROUTE_LABELS[match] : 'Dashboard';
}
