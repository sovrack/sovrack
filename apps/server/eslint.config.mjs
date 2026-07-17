// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import noSkipWithoutTrigger from './tools/eslint-plugins/no-skip-without-trigger.cjs';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'tools/eslint-plugins/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    plugins: {
      'deploy-automation-safety': {
        rules: {
          'no-skip-without-trigger': noSkipWithoutTrigger,
        },
      },
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // 450 = norme industrielle : marque les vrais god-files sans bruit sur
      // les services cohésifs légitimement gros (orchestrateurs, gestionnaires
      // SSH). Les pires offenders (ex. 1081L) ont été découpés.
      'max-lines': [
        'warn',
        { max: 450, skipComments: true, skipBlankLines: true },
      ],
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // Style, not correctness: async-without-await is often intentional
      // (NestJS lifecycle hooks, interface signature parity). Warn, don't block.
      '@typescript-eslint/require-await': 'warn',
      // Allow intentionally-unused identifiers prefixed with `_` — notably
      // interface-required params kept for signature parity (e.g. the
      // IGitProvider adapters' `_userId`/`_userRole`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
      // P1-07 safety net: catches `if (skipX) return;` early-return patterns
      // in service files. Anti-pattern that led to the original bug class.
      'deploy-automation-safety/no-skip-without-trigger': 'warn',
    },
  },
  // ── Per-area overrides (MUST stay last so they win in flat-config order) ──
  {
    // Layering guardrail: infrastructure/ (adapters techniques I/O : docker,
    // ssh, ansible…) ne doit JAMAIS dépendre de modules/ (le flux va
    // modules → infrastructure → shared, jamais l'inverse).
    files: ['src/adapters/**/*.ts'],
    ignores: ['src/adapters/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/**'],
              message:
                'Layering violation: infrastructure/ must not import from modules/ (dependencies flow modules → infrastructure → shared).',
            },
          ],
        },
      ],
    },
  },
  {
    // shared/ is the lowest layer — it must not import modules/ or adapters/.
    files: ['src/shared/**/*.ts'],
    ignores: ['src/shared/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/**'],
              message:
                'Layering violation: shared/ must not import from modules/ (dependencies flow downward only).',
            },
            {
              group: ['**/adapters/**'],
              message:
                'Layering violation: shared/ must not import from adapters/ (I/O layer).',
            },
          ],
        },
      ],
    },
  },
  {
    // e2e tests under test/ are intentionally excluded from the TS project
    // (tsconfig `exclude`), so they can't be type-checked by the lint
    // projectService. Lint them without type-aware rules instead of crashing
    // with "rule requires type information".
    ...tseslint.configs.disableTypeChecked,
    files: ['test/**/*.ts'],
  },
  {
    // Spec files use deliberately loose mocks (jest.fn(), .mock.calls[...]),
    // so the type-checked "unsafe any" family is noise here — keep it for
    // production code, silence it for test mocks.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Mocking legitimately uses require() (jest module mocks) and async
      // signatures with no await (async-iterator `next()`, signature parity).
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
