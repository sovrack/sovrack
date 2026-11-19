#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const [, , routeArg, titleArg] = process.argv;

function printUsage() {
  console.log('Usage: npm run scaffold:page -- <route> [title]');
  console.log('Example: npm run scaffold:page -- /billing "Billing"');
}

function toTitleCase(value) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

if (!routeArg) {
  printUsage();
  process.exit(1);
}

const normalizedRoute = routeArg.trim().replace(/^\/+|\/+$/g, '');
if (!normalizedRoute) {
  printUsage();
  process.exit(1);
}

const routeSegments = normalizedRoute.split('/').filter(Boolean);
const pageTitle = titleArg?.trim() || toTitleCase(routeSegments.at(-1) || 'Page');
const pageDescription = `Manage ${pageTitle.toLowerCase()} in one place.`;

const pageDirectory = path.join(process.cwd(), 'src', 'app', '(app)', ...routeSegments);
const pageFilePath = path.join(pageDirectory, 'page.tsx');

const fileTemplate = `'use client';

import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';

export default function ${pageTitle.replace(/\s+/g, '')}Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="${pageTitle}"
        description="${pageDescription}"
      />

      <SectionCard
        title="${pageTitle}"
        description="Replace this content with your feature implementation."
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Start by creating feature components in \`src/components/${routeSegments[0]}\`.
        </p>
      </SectionCard>
    </div>
  );
}
`;

try {
  await fs.access(pageFilePath);
  console.error(`Page already exists: ${pageFilePath}`);
  process.exit(1);
} catch {
  // File does not exist yet.
}

await fs.mkdir(pageDirectory, { recursive: true });
await fs.writeFile(pageFilePath, fileTemplate, 'utf8');

console.log(`Created page: src/app/(app)/${normalizedRoute}/page.tsx`);
console.log('Next step: register route label/nav in src/config/navigation.ts');
