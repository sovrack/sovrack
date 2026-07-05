import type { LucideIcon } from "lucide-react";
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
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export type AppNavSection = {
  id: "overview" | "infrastructure" | "integrations" | "settings";
  label: string;
  items: AppNavItem[];
};

// IA en 4 piliers : Overview · Infrastructure · Integrations · Settings.
// Décision utilisateur (LOT1c) : Dashboard, Projects et Deployments vivent
// ensemble dans Overview — la section Delivery (réduite à 2 items depuis le
// départ d'Automation) est supprimée.
// - Pipelines n'est plus un item de 1er niveau : c'est un SOUS-ONGLET de
//   Deployments (SubNav), pour lever le chevauchement Deployments/Pipelines.
// - E1 (plan produit final) : Automation rangée sous Infrastructure (elle
//   exécute des actions Ansible SUR des serveurs — pas de la livraison de
//   code) ; Git Providers + Registry regroupés sous Integrations (connexions
//   à des services EXTERNES — ni infra à soi, ni réglages plateforme) ;
//   Monitoring (vue par serveur) ajouté à Infrastructure.
export const APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/projects", label: "Projects", icon: FolderGit2 },
      { href: "/deployments", label: "Deployments", icon: Rocket },
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    items: [
      {
        href: "/admin/servers",
        label: "Servers",
        icon: Server,
        adminOnly: true,
      },
      {
        href: "/admin/monitoring",
        label: "Monitoring",
        icon: Activity,
        adminOnly: true,
      },
      {
        href: "/automation",
        label: "Automation",
        icon: Wrench,
        adminOnly: true,
      },
      { href: "/settings/ssh-keys", label: "SSH Keys", icon: KeyRound },
      {
        href: "/terminal",
        label: "Terminal",
        icon: TerminalSquare,
        adminOnly: true,
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    items: [
      {
        href: "/settings/git",
        label: "Git Providers",
        icon: GitBranch,
        adminOnly: true,
      },
      {
        href: "/settings/registry",
        label: "Registry",
        icon: Database,
        adminOnly: true,
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      {
        href: "/settings",
        label: "Platform Settings",
        icon: Settings,
        adminOnly: true,
      },
      {
        href: "/admin/users",
        label: "Users & Teams",
        icon: Users,
        adminOnly: true,
      },
      {
        href: "/settings/status",
        label: "System Status",
        icon: Activity,
        adminOnly: true,
      },
      {
        href: "/settings/audit-logs",
        label: "Audit Logs",
        icon: ClipboardList,
        adminOnly: true,
      },
    ],
  },
];

export function isRouteActive(pathname: string, href: string): boolean {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`))
  );
}
