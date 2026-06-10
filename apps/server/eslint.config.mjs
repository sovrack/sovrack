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
      'platform-safety': {
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
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
      // P1-07 safety net: catches `if (skipX) return;` early-return patterns
      // in service files. Anti-pattern that led to the original bug class.
      'platform-safety/no-skip-without-trigger': 'warn',
    },
  },
);
