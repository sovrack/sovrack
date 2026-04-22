'use client';

import Link from 'next/link';
import { 
  Lock, 
  GitBranch, 
  Database, 
  Key, 
  BarChart3, 
  User,
  TerminalSquare 
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

const SETTINGS_SECTIONS = [
  {
    icon: <User size={20} />,
    title: 'Profil',
    description: 'Gérez vos informations personnelles et votre mot de passe',
    href: '/settings/profile',
    color: 'bg-blue-500/10 text-blue-400',
  },
  {
    icon: <GitBranch size={20} />,
    title: 'Fournisseurs Git',
    description: 'Configurez les connexions GitLab et les paramètres OAuth',
    href: '/settings/git',
    color: 'bg-purple-500/10 text-purple-400',
  },
  {
    icon: <Database size={20} />,
    title: 'Registres',
    description: 'Gérez vos registres de conteneurs (Docker Hub, ECR, GCR)',
    href: '/settings/registry',
    color: 'bg-green-500/10 text-green-400',
  },
  {
    icon: <Key size={20} />,
    title: 'Clés SSH',
    description: 'Gérez vos clés SSH pour l\'accès aux serveurs',
    href: '/settings/ssh-keys',
    color: 'bg-orange-500/10 text-orange-400',
  },
  {
    icon: <TerminalSquare size={20} />,
    title: 'Terminal',
    description: 'Accédez rapidement aux logs de déploiement',
    href: '/settings/terminal',
    color: 'bg-cyan-500/10 text-cyan-400',
  },
  {
    icon: <BarChart3 size={20} />,
    title: 'Journaux d\'Audit',
    description: 'Consultez l\'historique des actions et des changements',
    href: '/settings/audit-logs',
    color: 'bg-yellow-500/10 text-yellow-400',
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Paramètres"
        title="Configuration"
        description="Gérez vos paramètres personnels, vos intégrations et vos configurations de sécurité."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 transition hover:border-[var(--text-primary)] hover:shadow-lg"
          >
            <div className={`mb-4 inline-flex w-fit rounded-lg ${section.color} p-3`}>
              {section.icon}
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[var(--text-primary)] group-hover:text-blue-400">
              {section.title}
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {section.description}
            </p>
            <div className="mt-auto pt-4">
              <span className="inline-flex items-center text-sm font-medium text-blue-400 opacity-0 group-hover:opacity-100">
                Accéder →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
