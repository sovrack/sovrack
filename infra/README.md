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

La recette d'acceptation locale démarre une pile entièrement isolée de la
production : PostgreSQL, Redis, Mailpit, backend, frontend et Nginx. Les
migrations s'exécutent avant un seed local idempotent qui ne supprime aucune
ligne et refuse toute base distante.

```bash
make local-up

# Application et connexions clients
# http://localhost:13080

# Connexion staff
# http://localhost:13080/staff/login

# Emails de validation capturés localement (aucun email Internet)
# http://localhost:18025

make local-logs
make local-down      # conserve la base locale
make local-reset     # supprime uniquement les volumes sovrack-local
```

Les identifiants déterministes sont définis dans le seed local du backend. Ils
ne doivent jamais être copiés dans un environnement partagé ou de production.

Le premier compte staff de production est une opération distincte et unique.
Son mot de passe est demandé sans écho et n'est ni ajouté à `.env`, ni placé
dans les arguments du processus :

```bash
sudo -u deploy make -C /srv/sovrack/current bootstrap-staff \
  BASE_DIR=/srv/sovrack EMAIL=root@example.com
```

Après connexion, le `ROOT` configure l'envoi dans
`/staff/settings/email`, teste le transport, puis invite les autres comptes
staff. Les comptes invités choisissent eux-mêmes leur mot de passe via un lien
à usage unique de 24 heures.

```bash
# Validation sans secret réel
docker compose --env-file .env.production.example \
  -f docker-compose.prod.yml config -q

# Scripts et restauration sur stack jetable
make test-scripts

# Shell statique via l'image utilisée en CI
docker run --rm -v "$PWD:/mnt:ro" -w /mnt \
  koalaman/shellcheck-alpine:v0.11.0@sha256:9955be09ea7f0dbf7ae942ac1f2094355bb30d96fffba0ec09f5432207544002 \
  -x scripts/*.sh tests/*.sh
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
