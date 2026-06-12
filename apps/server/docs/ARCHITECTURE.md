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

## 1bis. Invariants du modèle de données (à respecter absolument)

**Le provider Git est lié au SERVICE, jamais au PROJET.**

```
Project  =  regroupement de Services (l'application).  ⛔ PAS de provider.
Service  =  unité déployable.  ✅ porte SON provider (Service.providerId?).
```

Conséquences (non négociables) :
- Un même `Project` peut contenir des services de **providers différents**
  (un service GitLab + un service GitHub dans le même projet).
- La résolution correcte du provider est **par service** : `forService(serviceId)`.
- `forProject(projectId)` est une **commodité valable UNIQUEMENT pour un projet
  mono-provider** : elle résout vers le provider du *premier* service trouvé.
  ✅ **Migré (100%)** : les 6 sites (build, deployments, webhooks) utilisent
  désormais le pattern `service en scope ? forService(serviceId) :
  forProject(projectId)` — résolution correcte par service dès qu'on a le
  service (webhook : `serviceEnvId → serviceId`), fallback projet seulement
  pour les contextes réellement sans service. Plus aucune résolution provider
  par projet « en dur ».

> Règle de conception : tout nouveau code qui a besoin du provider doit partir
> d'un **serviceId** (→ `forService`), jamais d'un projectId.

## 1ter. Build & Deploy : l'unité déployée est le ServiceEnvironment

```
Service             = LE QUOI (le code, le repo, les défauts).  ⛔ ne tourne jamais seul.
Environment         = LE OÙ (staging / prod).                   ⛔ ne tourne jamais seul.
ServiceEnvironment  = L'INSTANCE (ce service, sur cette cible). ✅ c'est ÇA qu'on build et déploie.
Build               = l'ARTEFACT (image) produit depuis le code du Service.
Deployment          = l'ACTE : « lancer ce Build sur ce ServiceEnvironment ».
```

- `Deployment.serviceEnvId` + `Deployment.buildId` sont la **source de vérité**.
  `serviceId`/`environmentId`/`projectId` à côté = **snapshots dénormalisés**
  (requêtes/perf), jamais la primitive de résolution.
- Un `ServiceEnvironment` est l'unité atomique de build **et** de déploiement.

### Cible « Build once, promote » (standard release entreprise)
Aujourd'hui : 1 Build par ServiceEnvironment (rebuild pour staging puis prod).
Cible : builder l'image **une seule fois** (niveau Service + commit), puis
**promouvoir le MÊME artefact** vers staging → prod via des `Deployment`.
Garantit que staging et prod exécutent l'image **identique**. Le modèle le
permet déjà (`Build.deployments[]` : un Build → plusieurs Deployments) ; le
flux de création reste à faire évoluer (runtime requis).

## 1quater. Architecture `source/` (intégration multi-provider)

Pattern adapter **complet**, en 3 couches :

```
1. CONTRATS génériques (écrits une fois) :
   - IGitProvider      → opérations repo/pipeline/fichiers (listRepos, triggerPipeline, writeFiles…)
   - IWebhookHandler   → réception d'un webhook entrant

2. ROUTAGE générique :
   - source-providers.service : REGISTRE (registeredProviders) → forType/forService (Open/Closed)
   - webhooks/incoming-webhook.controller : reçoit, identifie l'endpoint, dispatche au bon handler

3. ADAPTERS spécifiques par provider (github/, gitlab/) :
   - chacun implémente IGitProvider + IWebhookHandler avec SON API.
```

**Pourquoi github/ et gitlab/ ont du code différent (ce n'est PAS de la
duplication à fusionner)** : ce sont deux **modèles d'intégration distincts** —
- GitHub : `push` → la plateforme déclenche elle-même build/deploy.
- GitLab : GitLab CI exécute le pipeline → nous **réagissons** à son statut.
Forcer une fusion serait l'anti-pattern. Chaque API (endpoints, auth, payloads)
est légitimement spécifique → c'est exactement le rôle d'un adapter.

**État** :
- ✅ Cycle `gitlab-core ↔ gitlab-ci` **cassé** (extraction `GitlabProjectConfigService`).
- ✅ Résolution par registre (ajouter un provider = +1 adapter, cf.
  `docs/ADDING-A-GIT-PROVIDER.md`).
- ⏳ Mineur (optionnel) : la résolution `endpoint → service` (~15 l.) est
  encore présente dans les 2 handlers → extractible en un helper partagé
  (faible valeur, flux webhook critique → à faire avec runtime).

→ `source/` est **architecturalement complet et correct**. Le « gros » restant
(faire évoluer les *flux* build/deploy) est comportemental → runtime requis.

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
