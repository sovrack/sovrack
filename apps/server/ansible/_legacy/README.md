# Playbooks Legacy — Ne plus utiliser

**Date d'archivage : 2026-06-14**

## Raison

Ces playbooks géraient le **déploiement d'applications via SSH + Ansible**.
Ils ont été remplacés par l'**API Docker TLS directe (dockerode)** depuis juin 2026.
Le chemin actif passe désormais par **`DockerDeployExecutorService`**
(`backend/src/modules/deployments/services/docker-deploy-executor.service.ts`), qui
parle directement au démon Docker du VPS (port 2376, TLS) : pull image → suppression
de l'ancien conteneur → création/démarrage du nouveau → health-check → digest.

**Ansible reste utilisé uniquement pour la PROVISION des serveurs** (installation de
Docker, Nginx, Certbot, pare-feu) et le SSL — playbooks restés dans `../playbooks/` :
`prepare-server.yml`, `ssl-certbot.yml`, `ssl-revoke.yml` (+ provision : `detect-server.yml`,
`validate-server.yml`, `setup-server*.yml`, `install-all-tools.yml`).

## Playbooks archivés (responsabilité d'origine → remplacement actuel)

| Playbook | Responsabilité d'origine | Remplacé aujourd'hui par |
|----------|--------------------------|--------------------------|
| `deploy.yml` | Déploiement générique (pull image depuis un registre → run) | `DockerDeployExecutorService.executeDeploy()` (pull + run via Docker API) |
| `deploy-local-build.yml` | Clone + `docker build` sur le VPS + run blue-green | Build local + run via Docker API (`isLocalBuild`) |
| `deploy-nixpacks.yml` | Build Nixpacks sur le VPS + run | idem (BuildPack NIXPACKS) |
| `deploy-static.yml` | Déploiement d'une release statique | idem (BuildPack STATIC) |
| `deploy-compose.yml` | `docker compose up` sur le VPS | idem (BuildPack DOCKER_COMPOSE) |
| `deploy-blue-green.yml` | Bascule blue-green sans coupure | `DeploymentStrategy.BLUE_GREEN` (couche Docker API) |
| `deploy-buildpacks.yml` | Build via Cloud Native Buildpacks | idem (BuildPack BUILDPACK) |
| `rollback.yml` | Rollback applicatif Docker via Ansible | `DeploymentsRollbackService` (re-pull du digest `imageSha` immuable via Docker API) |

## Note technique

Ces noms de fichiers apparaissent encore comme **littéraux de chaîne** dans
`backend/src/modules/build/strategies/build-strategy.resolver.ts` (champ `playbook`
de `DeployRoute`). Ce champ est **mort** : seul `needsDirectTrigger` est consommé ;
aucun code ne charge ces fichiers depuis le disque. Le retrait de ce champ est un
nettoyage de suivi (hors périmètre de cette tâche d'archivage). Déplacer ces
playbooks ne casse donc ni la compilation ni l'exécution du backend.
