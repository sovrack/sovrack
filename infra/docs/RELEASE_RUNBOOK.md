# Runbook de release Sovrack

## Invariants

- `BACKEND_IMAGE` et `FRONTEND_IMAGE` pointent vers un SHA Git complet (40 caractères hexadécimaux) ou un digest `sha256`.
- Le fichier `.env` du VPS reste local, en mode `0600`, et n'est jamais synchronisé par la CI.
- Une seule promotion de production s'exécute à la fois (`resource_group: sovrack-production`).
- Le migrateur est un conteneur one-shot. L'API et le worker ne lancent jamais de migration au démarrage ordinaire.
- La promotion n'est inscrite dans `.env` qu'après les contrôles de santé.

## Première installation

1. Exécuter `./scripts/bootstrap.sh`, compléter tous les secrets de `.env` et remplacer les deux références d'images.
2. Lancer `./scripts/deploy.sh`. Sans certificat, Nginx démarre volontairement en HTTP limité au challenge ACME.
3. Vérifier que le DNS du domaine pointe vers l'hôte, puis lancer `./scripts/certbot.sh`.
4. Vérifier `docker compose --env-file .env -f docker-compose.prod.yml ps` et l'accès HTTPS.
5. Installer le renouvellement avec `sudo ./scripts/install-certbot-renew.sh /srv/sovrack`.

## Promotion normale

Le job GitLab `deploy` est manuel. Il reçoit les variables protégées `BACKEND_IMAGE` et `FRONTEND_IMAGE`, transfère un manifeste de deux lignes, puis appelle :

```bash
./scripts/deploy.sh --release-file .release-request
```

Le script valide les références, crée un backup PostgreSQL, tire uniquement les images applicatives, exécute le migrateur, attend les healthchecks puis persiste atomiquement les références. Une erreur laisse l'ancienne version désirée dans `.env` et affiche les logs critiques.

## Rollback

Un rollback d'images après migration n'est pas automatiquement sûr. Il faut d'abord confirmer que toutes les migrations appliquées sont de type expand/contract et restent compatibles avec l'ancienne application.

Seulement dans ce cas, définir temporairement :

```dotenv
ALLOW_AUTOMATIC_IMAGE_ROLLBACK=true
```

Sinon, conserver la valeur `false`, examiner la base et les logs, puis promouvoir explicitement des images corrigées. Un rollback de données passe par la procédure de restauration, pas par un simple changement de tag Docker.

## Restauration PostgreSQL

```bash
./scripts/restore.sh backups/sovrack-YYYYMMDD-HHMMSS.sql.gz
```

La procédure vérifie le gzip et son checksum, exige de saisir le nom exact de la base, crée un backup de sécurité sans rotation, arrête l'entrée publique et les writers, recrée une base vide, importe le dump, réexécute le migrateur puis attend les healthchecks. En cas d'échec, les services applicatifs restent arrêtés et le chemin du backup de retour est affiché.

L'option `--allow-unverified` est réservée aux anciens dumps dont l'intégrité a été vérifiée par un autre canal.

## Vérifications après release

```bash
docker compose --env-file .env -f docker-compose.prod.yml ps
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=150 migrator backend worker frontend nginx
curl --fail --show-error --silent https://sovrack.tech/ >/dev/null
curl --fail --show-error --silent https://sovrack.tech/backend-api/health
```

Conserver au moins une copie chiffrée des backups sur un stockage hors du VPS et tester périodiquement une restauration dans un environnement isolé.
