"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  FolderGit2,
  Rocket,
  Server,
  KeyRound,
  Terminal,
  GitBranch,
  Boxes,
  User,
  CreditCard,
  Users,
  Sun,
  Moon,
  PlusCircle,
  X,
} from "lucide-react";
import { useTheme } from "@/shared/contexts/theme-context";
import clsx from "clsx";

type PaletteItem = {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  section: "Pages" | "Actions" | "Thème";
  keywords?: string[];
  onSelect: () => void;
};

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const { isLight, toggleTheme } = useTheme();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const items: PaletteItem[] = useMemo(() => {
    return [
      {
        id: "nav-dashboard",
        title: "Tableau de bord",
        subtitle: "Vue d'ensemble et métriques",
        icon: LayoutDashboard,
        section: "Pages",
        keywords: ["home", "accueil", "stats", "kpi"],
        onSelect: () => router.push("/dashboard"),
      },
      {
        id: "nav-projects",
        title: "Projets",
        subtitle: "Gestion des applications et dépôts",
        icon: FolderGit2,
        section: "Pages",
        keywords: ["apps", "services", "repo"],
        onSelect: () => router.push("/projects"),
      },
      {
        id: "nav-deployments",
        title: "Déploiements",
        subtitle: "Historique et journaux de build en direct",
        icon: Rocket,
        section: "Pages",
        keywords: ["build", "logs", "releases"],
        onSelect: () => router.push("/deployments"),
      },
      {
        id: "nav-servers",
        title: "Serveurs & Infrastructure",
        subtitle: "Flotte VPS et nœuds bare-metal",
        icon: Server,
        section: "Pages",
        keywords: ["vps", "nodes", "hosts", "ansible"],
        onSelect: () => router.push("/admin/servers"),
      },
      {
        id: "nav-ssh",
        title: "Clés SSH",
        subtitle: "Clés d'accès et certificats serveurs",
        icon: KeyRound,
        section: "Pages",
        keywords: ["ssh", "keys", "security"],
        onSelect: () => router.push("/admin/ssh-keys"),
      },
      {
        id: "nav-terminal",
        title: "Terminal Web",
        subtitle: "Session SSH interactive xterm.js",
        icon: Terminal,
        section: "Pages",
        keywords: ["shell", "bash", "console"],
        onSelect: () => router.push("/admin/terminal"),
      },
      {
        id: "nav-git",
        title: "Fournisseurs Git",
        subtitle: "Connexions GitHub & GitLab",
        icon: GitBranch,
        section: "Pages",
        keywords: ["github", "gitlab", "oauth"],
        onSelect: () => router.push("/admin/git-providers"),
      },
      {
        id: "nav-registry",
        title: "Registre de Conteneurs",
        subtitle: "Docker Hub, GHCR, registres privés",
        icon: Boxes,
        section: "Pages",
        keywords: ["docker", "ghcr", "images"],
        onSelect: () => router.push("/admin/registries"),
      },
      {
        id: "nav-account",
        title: "Mon compte",
        subtitle: "Profil, sécurité et MFA",
        icon: User,
        section: "Pages",
        keywords: ["profile", "password", "mfa", "security"],
        onSelect: () => router.push("/account"),
      },
      {
        id: "nav-billing",
        title: "Facturation & Plans",
        subtitle: "Abonnement, factures et quotas Stripe",
        icon: CreditCard,
        section: "Pages",
        keywords: ["stripe", "plan", "invoices", "pricing"],
        onSelect: () => router.push("/billing"),
      },
      {
        id: "nav-teams",
        title: "Espaces de travail",
        subtitle: "Membres, rôles et organisations",
        icon: Users,
        section: "Pages",
        keywords: ["workspaces", "organizations", "members", "team"],
        onSelect: () => router.push("/admin/teams"),
      },
      {
        id: "action-new-project",
        title: "Créer un nouveau projet",
        subtitle: "Déployer un dépôt Git ou un Dockerfile",
        icon: PlusCircle,
        section: "Actions",
        keywords: ["create", "nouveau", "deploy", "add"],
        onSelect: () => router.push("/projects?dialog=create-project"),
      },
      {
        id: "action-theme-toggle",
        title: isLight ? "Passer en mode Sombre" : "Passer en mode Clair",
        subtitle: isLight ? "Thème sombre optimisé nuit" : "Thème clair pour la journée",
        icon: isLight ? Moon : Sun,
        section: "Thème",
        keywords: ["theme", "dark", "light", "mode", "clair", "sombre"],
        onSelect: () => toggleTheme(),
      },
    ];
  }, [router, isLight, toggleTheme]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const query = search.toLowerCase();
    return items.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(query);
      const matchSubtitle = item.subtitle?.toLowerCase().includes(query) ?? false;
      const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(query)) ?? false;
      return matchTitle || matchSubtitle || matchKeywords;
    });
  }, [items, search]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleSelect = (item: PaletteItem) => {
    setIsOpen(false);
    setSearch("");
    item.onSelect();
  };

  const handleKeyDownList = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(filteredItems[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 sm:px-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-zinc-700/60 bg-[#16161a] shadow-2xl transition-all">
        {/* Search header */}
        <div className="flex items-center border-b border-zinc-800 px-4 py-3">
          <Search className="h-5 w-5 text-zinc-400 shrink-0 mr-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDownList}
            placeholder="Rechercher une page, un projet ou une action..."
            autoFocus
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <button
            onClick={() => setIsOpen(false)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results list */}
        <div className="max-h-80 overflow-y-auto p-2 no-scrollbar">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              Aucun résultat pour « {search} »
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={clsx(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition",
                    isSelected
                      ? "bg-[#2563EB] text-white"
                      : "text-zinc-300 hover:bg-zinc-800/60",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={clsx(
                        "h-4 w-4 shrink-0",
                        isSelected ? "text-white" : "text-zinc-400",
                      )}
                    />
                    <div className="truncate">
                      <p className="text-sm font-medium leading-tight truncate">
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p
                          className={clsx(
                            "text-xs truncate mt-0.5",
                            isSelected ? "text-blue-100" : "text-zinc-500",
                          )}
                        >
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shrink-0",
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-zinc-800 text-zinc-400",
                    )}
                  >
                    {item.section}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-900/60 px-4 py-2 text-[11px] text-zinc-500">
          <div className="flex items-center gap-2">
            <span>Naviguer avec</span>
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 border border-zinc-700">↑</kbd>
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 border border-zinc-700">↓</kbd>
            <span>Ouvrir</span>
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 border border-zinc-700">↵</kbd>
          </div>
          <div>
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 border border-zinc-700">Esc</kbd>
            <span className="ml-1.5">Fermer</span>
          </div>
        </div>
      </div>
    </div>
  );
}
