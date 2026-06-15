import type { ReactNode } from 'react';
import { Box, Code2, Globe, Layers, Sparkles } from 'lucide-react';

/* Shared build-engine constants/types used by the build config panels. */

export type EngineOption = {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: string;
  badgeColor?: string;
};

export const ENGINES: EngineOption[] = [
  { id: 'DOCKERFILE',     label: 'Dockerfile',     icon: <Code2 size={14} />,    badge: 'Recommended', badgeColor: 'text-green-300' },
  { id: 'NIXPACKS',       label: 'Nixpacks',       icon: <Sparkles size={14} />, badge: 'Auto-detect', badgeColor: 'text-purple-300' },
  { id: 'BUILDPACK',      label: 'Buildpack',      icon: <Layers size={14} /> },
  { id: 'DOCKER_COMPOSE', label: 'Docker Compose', icon: <Box size={14} /> },
  { id: 'STATIC',         label: 'Site statique',  icon: <Globe size={14} /> },
];

export const PROJECT_TYPES: { value: string; label: string }[] = [
  { value: 'nestjs',        label: 'NestJS API' },
  { value: 'nextjs',        label: 'Next.js App' },
  { value: 'react',         label: 'React SPA' },
  { value: 'nodejs',        label: 'Node.js' },
  { value: 'python',        label: 'Python' },
  { value: 'django',        label: 'Django' },
  { value: 'go',            label: 'Go Service' },
  { value: 'java',          label: 'Java' },
  { value: 'spring-boot',   label: 'Spring Boot' },
  { value: 'php',           label: 'PHP' },
  { value: 'laravel',       label: 'Laravel' },
  { value: 'ruby',          label: 'Ruby' },
  { value: 'rust',          label: 'Rust' },
  { value: 'static',        label: 'Site statique' },
  { value: 'dockerized',    label: 'Dockerfile existant' },
  { value: 'compose',       label: 'Docker Compose' },
];

export type ServiceLocalConfig = {
  engine: string;
  port: string;
  startCmd: string;
  type: string;
};
