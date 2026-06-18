import { describe, it, expect } from 'vitest';
import { dur, resolveDeploymentUrl, splitImageRef, timeAgo } from './deployment-utils';
import type { Deployment } from '@/types/deployment';

describe('splitImageRef', () => {
  it('sépare image:tag simple', () => {
    expect(splitImageRef('nginx:alpine')).toEqual({ image: 'nginx', tag: 'alpine' });
  });
  it('image sans tag', () => {
    expect(splitImageRef('nginx')).toEqual({ image: 'nginx', tag: '' });
  });
  it('ne confond pas le port du registre avec un tag', () => {
    expect(splitImageRef('registry.local:5000/app')).toEqual({ image: 'registry.local:5000/app', tag: '' });
  });
  it('gère registre avec port ET tag', () => {
    expect(splitImageRef('registry.local:5000/app:1.2.3')).toEqual({ image: 'registry.local:5000/app', tag: '1.2.3' });
  });
  it('gère un chemin de groupe + tag', () => {
    expect(splitImageRef('registry.gitlab.com/grp/proj:latest')).toEqual({ image: 'registry.gitlab.com/grp/proj', tag: 'latest' });
  });
  it('chaîne vide', () => {
    expect(splitImageRef('')).toEqual({ image: '', tag: '' });
  });
});

describe('timeAgo', () => {
  it('returns "just now" for < 1 min', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now');
  });
  it('returns minutes / hours / days', () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(timeAgo(ago(5 * 60_000))).toBe('5m ago');
    expect(timeAgo(ago(3 * 3_600_000))).toBe('3h ago');
    expect(timeAgo(ago(2 * 86_400_000))).toBe('2d ago');
  });
});

describe('dur', () => {
  it('returns null without a start', () => {
    expect(dur(null)).toBeNull();
  });
  it('formats seconds and minutes', () => {
    const start = '2026-01-01T00:00:00.000Z';
    expect(dur(start, '2026-01-01T00:00:30.000Z')).toBe('30s');
    expect(dur(start, '2026-01-01T00:01:30.000Z')).toBe('1m 30s');
  });
});

describe('resolveDeploymentUrl', () => {
  it('prefers an explicit publicUrl', () => {
    const dep = { publicUrl: 'https://app.example.com' } as Deployment;
    expect(resolveDeploymentUrl(dep)).toBe('https://app.example.com');
  });

  it('falls back to a target domain', () => {
    const dep = {
      serviceId: 's1',
      environment: {
        serviceTargets: [{ serviceId: 's1', domain: 'svc.example.com', server: { host: '10.0.0.1' } }],
      },
    } as unknown as Deployment;
    expect(resolveDeploymentUrl(dep)).toBe('http://svc.example.com');
  });

  it('falls back to host:port', () => {
    const dep = {
      serviceId: 's1',
      environment: {
        serviceTargets: [{ serviceId: 's1', port: 8080, server: { host: '192.168.1.5' } }],
      },
    } as unknown as Deployment;
    expect(resolveDeploymentUrl(dep)).toBe('http://192.168.1.5:8080');
  });

  it('returns null when no server is resolvable', () => {
    const dep = { serviceId: 's1', environment: { serviceTargets: [] } } as unknown as Deployment;
    expect(resolveDeploymentUrl(dep)).toBeNull();
  });
});
