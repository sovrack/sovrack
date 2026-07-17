# Tests de charge & SLO — Deploy Automation API

Scénario [k6](https://k6.io) qui exerce les chemins de lecture les plus chauds de
l'API sous charge, avec des seuils (SLO) bloquants.

## Lancer
```bash
# k6 doit être installé (https://k6.io/docs/get-started/installation/)
API=http://localhost:3001 \
EMAIL=admin@deployautomation.local PASSWORD='CHANGE_MOI_ADMIN_PASSWORD' \
k6 run backend/test/load/api-load.k6.js
```
Profil : montée à **20 VUs**, palier 1 min, descente. Login **une seule fois**
(route `/auth/login` limitée à 5/min), JWT réutilisé en Bearer.

## SLO (objectifs de niveau de service)
| Indicateur | Cible | Seuil k6 |
|---|---|---|
| Taux d'erreur HTTP | < 1 % | `http_req_failed: rate<0.01` |
| Latence globale p95 | < 500 ms | `http_req_duration: p(95)<500` |
| Latence readiness p95 | < 150 ms | `{endpoint:readiness}: p(95)<150` |

Le run **échoue** si un seuil est dépassé → utilisable en CI (job manuel/nightly,
pas sur chaque MR car nécessite une stack live + k6).

## Étendre
- Ajouter un scénario d'**écriture** (déploiement) en respectant le cap
  `Project.maxConcurrentDeploys` (sinon 400 attendus — fair-share).
- Brancher en CI nightly avec un environnement de staging dédié + seuils calibrés
  sur le matériel cible.

## Endpoints couverts
`/health/ready` (non authentifié) · `/projects` · `/deployments` ·
`/monitoring/overview` (authentifiés, Bearer).
