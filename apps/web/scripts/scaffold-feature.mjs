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

const feature = featureArg
  .trim()
  .replace(/^\/+|\/+$/g, '')
  .replace(/\s+/g, '-')
  .toLowerCase();
if (!feature) {
  printUsage();
  process.exit(1);
}

const featureTitle = feature
  .split('-')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');
const Pascal = featureTitle.replace(/\s+/g, '');
const camelService = `${feature.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Service`;

// Structure FEATURE-BASED : tout le domaine dans un seul dossier auto-contenu.
const featureDir = path.join(process.cwd(), 'src', 'features', feature);
const apiDir = path.join(featureDir, 'api');
const componentsDir = path.join(featureDir, 'components');

const serviceFile = path.join(apiDir, `${feature}.service.ts`);
const hookFile = path.join(apiDir, `use-${feature}.ts`);
const componentFile = path.join(componentsDir, `${feature}-panel.tsx`);
const typesFile = path.join(featureDir, 'types.ts');
const indexFile = path.join(featureDir, 'index.ts');

async function ensureNewFile(targetPath) {
  try {
    await fs.access(targetPath);
    console.error(
      `File already exists: ${path.relative(process.cwd(), targetPath)}`,
    );
    process.exit(1);
  } catch {
    // File does not exist.
  }
}

await ensureNewFile(featureDir);
await fs.mkdir(apiDir, { recursive: true });
await fs.mkdir(componentsDir, { recursive: true });

const serviceTemplate = `import apiClient from '@/shared/lib/api';

export const ${camelService} = {
  async list() {
    const response = await apiClient.get('/${feature}');
    return response.data;
  },
};
`;

const hookTemplate = `// TanStack Query hooks de la feature ${feature} (data layer).
export function use${Pascal}() {
  return {
    // useQuery / useMutation autour de ${camelService} ici.
  };
}
`;

const componentTemplate = `type ${Pascal}PanelProps = {
  title?: string;
};

export function ${Pascal}Panel({ title = '${featureTitle}' }: ${Pascal}PanelProps) {
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

const typesTemplate = `export type ${Pascal} = {
  id: string;
  createdAt: string;
  updatedAt: string;
};
`;

// Barrel = SEULE porte publique de la feature.
const indexTemplate = `// Barrel = porte publique de la feature ${feature}.
// Les autres features / l'app importent depuis '@/features/${feature}', jamais ses internes.
export { ${Pascal}Panel } from './components/${feature}-panel';
export { ${camelService} } from './api/${feature}.service';
export { use${Pascal} } from './api/use-${feature}';
export * from './types';
`;

await Promise.all([
  fs.writeFile(serviceFile, serviceTemplate, 'utf8'),
  fs.writeFile(hookFile, hookTemplate, 'utf8'),
  fs.writeFile(componentFile, componentTemplate, 'utf8'),
  fs.writeFile(typesFile, typesTemplate, 'utf8'),
  fs.writeFile(indexFile, indexTemplate, 'utf8'),
]);

console.log('Feature scaffold created (feature-based):');
for (const f of [serviceFile, hookFile, componentFile, typesFile, indexFile]) {
  console.log(`- ${path.relative(process.cwd(), f)}`);
}
