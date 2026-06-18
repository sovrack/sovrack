import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectOverviewTab } from './project-overview-tab';
import type { Deployment } from '@/types/deployment';
import type { Service } from '@/types/service';

const svc = (id: string): Service => ({ id, name: `svc-${id}` } as Service);
const dep = (id: string, status: Deployment['status'], startedAt: string): Deployment =>
  ({ id, status, startedAt, branch: 'main', service: { id: 's', name: 'api', type: null }, environment: { name: 'PRODUCTION' } } as unknown as Deployment);

describe('ProjectOverviewTab', () => {
  const baseProps = {
    projectId: 'p1',
    services: [svc('a'), svc('b')],
    environments: [{ id: 'e1', name: 'PRODUCTION' }],
    deployments: [
      dep('d1', 'SUCCESS', '2026-06-18T10:00:00Z'),
      dep('d2', 'FAILED', '2026-06-18T12:00:00Z'),
    ],
  };

  it('affiche les compteurs (services/envs/déploiements)', () => {
    render(<ProjectOverviewTab {...baseProps} onNavigate={vi.fn()} />);
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Environnements')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // 1 environnement (valeur unique)
    expect(screen.getAllByText('2')).toHaveLength(2); // 2 services + 2 déploiements
  });

  it('trie les déploiements récents du plus récent au plus ancien', () => {
    render(<ProjectOverviewTab {...baseProps} onNavigate={vi.fn()} />);
    const badges = screen.getAllByText(/Success|Failed/);
    // d2 (12:00, FAILED) doit précéder d1 (10:00, SUCCESS).
    expect(badges[0]).toHaveTextContent('Failed');
  });

  it('navigue au clic sur un compteur', () => {
    const onNavigate = vi.fn();
    render(<ProjectOverviewTab {...baseProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Services'));
    expect(onNavigate).toHaveBeenCalledWith('services');
  });

  it('état vide quand aucun déploiement', () => {
    render(<ProjectOverviewTab {...baseProps} deployments={[]} onNavigate={vi.fn()} />);
    expect(screen.getByText(/Aucun déploiement/)).toBeInTheDocument();
  });
});
