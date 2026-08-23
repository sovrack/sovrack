# Sovrack Infrastructure

Orchestration de production séparée du code backend/frontend. La cible actuelle
reste Docker Compose : elle est adaptée à un produit en développement, à
condition d'isoler la CI, de rendre les releases immuables et de disposer d'un
rollback de base réellement testé.

## Architecture

```text
Internet -> Nginx/TLS -> Frontend + Backend
                                   |
                             PostgreSQL + Redis
```

- Nginx est la seule entrée publique (`80/443`).
- PostgreSQL et Redis sont publiés uniquement sur `127.0.0.1`.
- Le mode `compact` exécute API et tâches de fond dans un backend unique pour
  les petits hôtes ; le mode `split` ajoute un worker dédié.
- Le migrateur est un conteneur one-shot appelé uniquement par `deploy.sh`.
- Les logs Docker sont bornés par taille et nombre de fichiers.
- La maintenance empêche toute écriture pendant backup/migration.

## Releases immuables

Chaque tag SemVer produit un bundle avec un manifeste strict : commits des
trois dépôts, images applicatives et d'infrastructure immuables, migration cible et checksum
OpenAPI. La CI installe le bundle dans :

```text
/srv/sovrack/releases/<release-id>
```

Le lien `/srv/sovrack/current` change uniquement après réussite de tous les
contrôles. Les secrets restent dans `/srv/sovrack/shared/.env` et ne sont
jamais synchronisés par GitLab.

Voir [le runbook de release](docs/RELEASE_RUNBOOK.md) et
[la checklist de production](docs/PRODUCTION_CHECKLIST.md).

## Commandes locales

```bash
# Validation sans secret réel
docker compose --env-file .env.production.example \
  -f docker-compose.prod.yml config -q

# Scripts et restauration sur stack jetable
make test-scripts

# Shell statique via l'image utilisée en CI
docker run --rm -v "$PWD:/mnt:ro" -w /mnt \
  koalaman/shellcheck:v0.11.0 -x scripts/*.sh tests/*.sh
```

## Première transition depuis le layout historique

Ne pas cloner ou synchroniser directement par-dessus `/srv/sovrack`. Le
pipeline transfère un bundle dans `incoming/`, l'extrait dans `releases/`, puis
copie l'ancien `.env` vers `shared/.env` sans supprimer l'original.

La procédure complète est dans [MIGRATION.md](docs/MIGRATION.md). Une baseline
R0 correspondant au schéma et aux images actuels doit exister avant la première
migration Phase 2.

## Exploitation

- [Runners GitLab séparés](docs/RUNNER_HARDENING.md)
- [Durcissement du VPS](docs/HOST_HARDENING.md)
- [Nettoyage ciblé](docs/CLEANUP.md)
- [Release, rollback, backups et TLS](docs/RELEASE_RUNBOOK.md)

Les scripts `install-backup-timer.sh` et `install-certbot-renew.sh` installent
des timers systemd qui suivent automatiquement la release pointée par `current`.
