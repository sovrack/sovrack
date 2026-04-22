#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const [, , featureArg] = process.argv;

function printUsage() {
  console.log('Usage: npm run scaffold:feature -- <feature-name>');
  console.log('Example: npm run scaffold:feature -- billing');
}

if (!featureArg) {
  printUsage();
  process.exit(1);
}

const feature = featureArg.trim().replace(/^\/+|\/+$/g, '').replace(/\s+/g, '-').toLowerCase();
if (!feature) {
  printUsage();
  process.exit(1);
}

const featureTitle = feature
  .split('-')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const componentDir = path.join(process.cwd(), 'src', 'components', feature);
const hookDir = path.join(process.cwd(), 'src', 'hooks');
const serviceDir = path.join(process.cwd(), 'src', 'services');
const typeDir = path.join(process.cwd(), 'src', 'types');

const componentFile = path.join(componentDir, `${feature}-panel.tsx`);
const hookFile = path.join(hookDir, `use${featureTitle.replace(/\s+/g, '')}.ts`);
const serviceFile = path.join(serviceDir, `${feature}.service.ts`);
const typeFile = path.join(typeDir, `${feature}.ts`);

async function ensureNewFile(targetPath) {
  try {
    await fs.access(targetPath);
    console.error(`File already exists: ${path.relative(process.cwd(), targetPath)}`);
    process.exit(1);
  } catch {
    // File does not exist.
  }
}

await Promise.all([
  ensureNewFile(componentFile),
  ensureNewFile(hookFile),
  ensureNewFile(serviceFile),
  ensureNewFile(typeFile),
]);

await fs.mkdir(componentDir, { recursive: true });
await fs.mkdir(hookDir, { recursive: true });
await fs.mkdir(serviceDir, { recursive: true });
await fs.mkdir(typeDir, { recursive: true });

const componentTemplate = `type ${featureTitle.replace(/\s+/g, '')}PanelProps = {
  title?: string;
};

export function ${featureTitle.replace(/\s+/g, '')}Panel({
  title = '${featureTitle}',
}: ${featureTitle.replace(/\s+/g, '')}PanelProps) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Replace this panel with ${featureTitle.toLowerCase()} UI blocks.
      </p>
    </section>
  );
}
`;

const hookTemplate = `export function use${featureTitle.replace(/\s+/g, '')}() {
  return {
    // Add TanStack Query hooks and UI state here.
  };
}
`;

const serviceTemplate = `import apiClient from '@/lib/api';

export const ${feature.replace(/-([a-z])/g, (_, char) => char.toUpperCase())}Service = {
  async list() {
    const response = await apiClient.get('/${feature}');
    return response.data;
  },
};
`;

const typeTemplate = `export type ${featureTitle.replace(/\s+/g, '')} = {
  id: string;
  createdAt: string;
  updatedAt: string;
};
`;

await Promise.all([
  fs.writeFile(componentFile, componentTemplate, 'utf8'),
  fs.writeFile(hookFile, hookTemplate, 'utf8'),
  fs.writeFile(serviceFile, serviceTemplate, 'utf8'),
  fs.writeFile(typeFile, typeTemplate, 'utf8'),
]);

console.log('Feature scaffold created:');
console.log(`- ${path.relative(process.cwd(), componentFile)}`);
console.log(`- ${path.relative(process.cwd(), hookFile)}`);
console.log(`- ${path.relative(process.cwd(), serviceFile)}`);
console.log(`- ${path.relative(process.cwd(), typeFile)}`);
