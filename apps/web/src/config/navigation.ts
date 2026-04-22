import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  Database,
  FolderGit2,
  GitBranch,
  Hammer,
  KeyRound,
  LayoutDashboard,
  Rocket,
  Server,
  Settings,
  TerminalSquare,
  Users,
} from 'lucide-react';

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export type AppNavSection = {
  id: 'home' | 'settings';
  label: string;
  items: AppNavItem[];
};

export const APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: 'home',
    label: 'Home',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/projects', label: 'Projects', icon: FolderGit2 },
      { href: '/deployments', label: 'Deployments', icon: Rocket },
      { href: '/builds', label: 'Builds', icon: Hammer },
      { href: '/terminal', label: 'Terminal', icon: TerminalSquare },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { href: '/settings/ssh-keys', label: 'SSH Keys', icon: KeyRound },
      { href: '/settings/git', label: 'Git', icon: GitBranch },
      { href: '/settings/registry', label: 'Registry', icon: Database, adminOnly: true },
      { href: '/settings/audit-logs', label: 'Audit Logs', icon: ClipboardList, adminOnly: true },
      { href: '/admin/users', label: 'Users & Teams', icon: Users, adminOnly: true },
      { href: '/admin/servers', label: 'Remote Servers', icon: Server, adminOnly: true },
      { href: '/admin/settings', label: 'Settings', icon: Settings, adminOnly: true },
    ],
  },
];

export const APP_ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/projects': 'Projects',
  '/deployments': 'Deployments',
  '/builds': 'Builds',
  '/terminal': 'Terminal',
  '/profile': 'Profile',
  '/settings/ssh-keys': 'SSH Keys',
  '/settings/git': 'Git',
  '/settings/registry': 'Registry',
  '/settings/audit-logs': 'Audit Logs',
  '/admin/users': 'Users & Teams',
  '/admin/teams': 'Users & Teams',
  '/admin/servers': 'Remote Servers',
  '/admin/settings': 'Settings',
};

export function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

export function resolveRouteLabel(pathname: string): string {
  const exact = APP_ROUTE_LABELS[pathname];
  if (exact) {
    return exact;
  }

  const match = Object.keys(APP_ROUTE_LABELS)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname.startsWith(`${route}/`));

  return match ? APP_ROUTE_LABELS[match] : 'Dashboard';
}
