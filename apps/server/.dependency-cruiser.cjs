/**
 * Règles d'architecture (gouvernance) — exécutées par dependency-cruiser.
 * Encode les lois du plan : pas de cycle, et `core/` ne dépend jamais du métier.
 */
module.exports = {
  forbidden: [
    // ── R1 : le flux va modules → infrastructure → shared, jamais l'inverse ───
    {
      name: 'shared-no-modules',
      severity: 'error',
      comment: 'shared/ est la couche la plus basse — ne doit jamais importer modules/',
      from: { path: '^src/shared' },
      to:   { path: '^src/modules' },
    },
    {
      name: 'shared-no-adapters',
      severity: 'error',
      comment: 'shared/ (technique pur) ne doit pas importer infrastructure/ (adapters I/O)',
      from: { path: '^src/shared' },
      to:   { path: '^src/adapters' },
    },
    {
      name: 'adapters-no-modules',
      severity: 'error',
      comment: 'infrastructure/ (adapters docker/ssh/ansible) ne doit JAMAIS importer un contexte métier (modules/)',
      from: { path: '^src/adapters' },
      to:   { path: '^src/modules' },
    },
    // ── R4 : source-providers ne doit pas importer les events internes de deployments ──
    // Règle ciblée (pas de backreferences) : seul le module qui a causé le problème
    // est nommé. La règle générale (shared/events = source unique) est enforced par ESLint.
    {
      name: 'source-providers-no-deployments-events',
      severity: 'error',
      comment: 'source-providers doit importer les events depuis shared/events/events.catalog.ts',
      from: { path: '^src/modules/source-providers/' },
      to: { path: '^src/modules/deployments/events/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Aucune dépendance circulaire (entre modules/contextes).',
      from: {
        // EXCEPTION ACCEPTÉE (documentée) : cycle forwardRef NestJS entre
        // infrastructure/preparation et servers/servers-shared — collaboration
        // bidirectionnelle légitime pendant l'onboarding serveur (ServersCore
        // déclenche la préparation Docker ; la préparation consomme les
        // primitives serveur). À casser par ÉVÉNEMENTS quand l'app tourne
        // (runtime requis). Exclu ici pour que la règle détecte les NOUVEAUX cycles.
        pathNot: [
          'src/modules/infrastructure/preparation/infrastructure\\.module\\.ts$',
          'src/modules/infrastructure/servers/servers-shared\\.module\\.ts$',
        ],
      },
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Fichiers orphelins (jamais importés) — candidats au nettoyage.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(spec|test)\\.ts$',
          '\\.module\\.ts$',
          'src/main\\.ts$',
          '\\.d\\.ts$',
          // Utilitaires de fondation fournis comme une lib interne : légitimement
          // « orphelins » tant que pas encore consommés (Result<T,E>, types).
          'src/shared/types/.+\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
