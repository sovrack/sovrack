import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // jsdom : permet de tester les composants React (.tsx) ; les tests de logique
    // pure fonctionnent aussi dans cet environnement.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      // Gate scopé à la LOGIQUE PURE déterministe (la plus haute valeur) :
      //  - shared/lib (api, auth, date/format helpers)
      //  - la logique pure des features (utils, validation de formulaire, catalogue)
      // Les composants UI sont smoke-testés à part ; les gater globalement serait
      // un ratchet faible. Seuils sous le réel actuel pour éviter la régression.
      provider: 'v8',
      include: [
        'src/shared/lib/**',
        'src/features/**/utils.ts',
        'src/features/**/*.validation.ts',
        'src/features/**/*.catalog.tsx',
      ],
      reporter: ['text-summary', 'lcov'],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 50,
        lines: 60,
      },
    },
  },
});
