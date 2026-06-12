/**
 * Règles d'architecture (gouvernance) — exécutées par dependency-cruiser.
 * Encode les lois du plan : pas de cycle, et `core/` ne dépend jamais du métier.
 */
module.exports = {
  forbidden: [
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
      name: 'core-no-business',
      severity: 'error',
      comment: 'core/ (technique) ne doit JAMAIS importer un contexte métier (modules/).',
      from: { path: '^src/core/' },
      to: { path: '^src/modules/' },
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
