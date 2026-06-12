# Architecture backend — platform IDP

Document de référence. Niveau entreprise : **15 contextes bornés** + **core technique**,
frontières imposées par l'outillage.

## 1. Carte des contextes (`src/modules/`)

| Contexte | Responsabilité | Modules internes |
|---|---|---|
| `iam/` | Identité & accès | auth, users, teams, ssh-keys |
| `catalog/` | Modèle déclaratif M3 | projects, environments, services, service-environments |
| `source-providers/` | Intégration Git (façade + adapters) | github, gitlab |
| `build/` | Fabrication d'artefacts | détection, engines, generators |
| `deployments/` | Mise en production | create, rollback, healthcheck, executor… |
| `infrastructure/` | Serveurs + runtime | servers, preparation, containers, volumes |
| `networking/` | Ingress (agrégat `Domain`) | domains, dns, ssl, proxy |
| `observability/` | Métriques & vues | monitoring, dashboard |
| `audit/` | Conformité (isolé) | — |
| `automation/` | Playbooks Ansible | — |
| `webhooks/` | Réception d'événements | — |
| `notifications/` | Alerting transverse | — |
| `container-registries/` | Registres d'images | — |
| `platform/` | Config globale | — |
| `terminal/` | Passerelle SSH temps réel | — |

`core/` = technique pur (crypto, db, jwt, ssh, events, queue, provisioning,
container-runtime…). Ne connaît **aucun** contexte métier.

## 2. Les lois d'architecture (non négociables)

1. **Sens des dépendances** : `core ◄ shared ◄ contextes`. `core/` n'importe
   jamais un contexte. Aucun cycle.
2. **Porte publique unique** : chaque contexte expose un `index.ts` (barrel).
   On importe un contexte via son barrel, jamais via un chemin profond.
3. **Communication inter-contextes** : soit un service public injecté (DI),
   soit un événement (`core/events`). Jamais l'intérieur d'un autre contexte.
4. **Enforcement** : `npm run arch:check` (dependency-cruiser) vérifie les
   lois 1 et 2 et fait échouer le CI en cas de violation.
5. **Gouvernance vivante** : ce document + les barrels comme contrats.

## 3. Outillage

```bash
npm run arch:check   # dependency-cruiser : cycles + core→métier + orphelins
npm run build        # nest build (tsc)
```

Config : `.dependency-cruiser.cjs`.

## 4. Règle de communication (loi 3)

- **Synchrone** : injecter le service public d'un autre contexte (exporté par
  son module). Ex : `DeploymentsModule` importe `infrastructure` (servers).
- **Découplé** : émettre/écouter un événement. Ex : `deployments` émet
  `DeploymentSucceeded` ; `notifications` et `audit` l'écoutent sans que
  `deployments` ne les connaisse.

## 5. État de la migration (dette tracée)

| Élément | État |
|---|---|
| Réorg 27 → 15 contextes | ✅ fait, build+tsc verts |
| Loi 1 (core→métier) | ✅ respectée (`arch:check`) |
| Loi 2 (barrels) | ✅ 15 portes ; `app.module` 100% via barrels. Reste : migrer les imports profonds **inter-services** vers les barrels |
| Cycle `gitlab-ci ↔ gitlab-core` | ⚠️ à résoudre lors de l'unification `source/` (extraire les helpers de config partagés) |
| Cycle `infrastructure/preparation ↔ servers` | ⚠️ `forwardRef` NestJS (intentionnel) — à casser proprement via un module de primitives partagées |
| Unification `source/` (adapters) | ⏳ façade ~70% ; dédup méthode-par-méthode restante |
| Schéma : `ServiceType × ArtifactSource`, `secretsEnv`, `sharedVariables` | ⏳ lockstep frontend + contrat |

## 6. Template d'un contexte

```
modules/<contexte>/
├── index.ts                 # porte publique (le SEUL point d'import externe)
├── <contexte>.module.ts     # wiring + exports DI
├── <contexte>.controller.ts # routes
├── services/                # logique (interne sauf exports du barrel)
├── dto/                     # contrats
└── events/                  # événements émis/écoutés (si applicable)
```
