import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // ── Garde-fous d'architecture (couches, comme le backend) ──────────────────
  {
    // Les LEAVES de shared/ (ui, lib, hooks, contexts, config) sont PURES :
    // elles ne doivent jamais dépendre d'une feature (le flux va
    // features → shared, jamais l'inverse). Le shell (layout, providers,
    // protected-route) compose les features → exclu de cette règle.
    files: [
      'src/shared/ui/**/*.{ts,tsx}',
      'src/shared/lib/**/*.{ts,tsx}',
      'src/shared/hooks/**/*.{ts,tsx}',
      'src/shared/contexts/**/*.{ts,tsx}',
      'src/shared/config/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/features/*/**'],
              message:
                'Layering: shared/ (leaf) ne doit pas importer une feature. Le flux va features → shared.',
            },
          ],
        },
      ],
    },
  },
  {
    // max-lines sur les fichiers de features (flagge les composants/pages géants).
    // L'isolation inter-feature (barrel only) est vérifiée par quality-gates.mjs.
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'max-lines': [
        'warn',
        { max: 500, skipComments: true, skipBlankLines: true },
      ],
    },
  },
];

export default eslintConfig;
