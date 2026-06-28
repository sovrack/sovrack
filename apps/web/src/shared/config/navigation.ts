import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ClipboardList,
  Database,
  FolderGit2,
  GitBranch,
  GitPullRequestArrow,
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
      { href: '/deployments', label: 'Deployments', icon: Rocket },
      { href: '/pipelines', label: 'Pipelines', icon: GitPullRequestArrow },
      { href: '/admin/servers', label: 'Remote Servers', icon: Server, adminOnly: true },
      { href: '/terminal', label: 'Terminal', icon: TerminalSquare, adminOnly: true },
      { href: '/automation', label: 'Automation', icon: Wrench, adminOnly: true },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { href: '/settings', label: 'Platform Settings', icon: Settings, adminOnly: true },
      { href: '/settings/status', label: 'System Status', icon: Activity, adminOnly: true },
      { href: '/settings/ssh-keys', label: 'SSH Keys', icon: KeyRound },
      { href: '/settings/git', label: 'Git Providers', icon: GitBranch, adminOnly: true },
      { href: '/settings/registry', label: 'Registry', icon: Database, adminOnly: true },
      { href: '/settings/audit-logs', label: 'Audit Logs', icon: ClipboardList, adminOnly: true },
      { href: '/admin/users', label: 'Users & Teams', icon: Users, adminOnly: true },
    ],
  },
];

export function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

