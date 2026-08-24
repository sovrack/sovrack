# Runbook de release Sovrack

## Modèle de production

Une release est un ensemble immuable :

- commit backend et image backend immuable ;
- commit frontend et image frontend immuable ;
- digests immuables Nginx, PostgreSQL et Redis ;
- commit infrastructure ;
- topologie runtime (`compact`, `split` ou baseline `legacy-single`) ;
- dernière migration Prisma attendue ;
- SHA-256 du contrat OpenAPI ;
- identifiant SemVer (`v2.0.0-rc.1`, puis `v2.0.0`).

Le VPS utilise le layout suivant :

```text
/srv/sovrack/
├── releases/<release-id>/
├── shared/
│   ├── .env
│   ├── backups/
│   ├── maintenance/
│   └── release-manifests/
├── incoming/
└── current -> releases/<release-id>
```

La CI n'écrase jamais `current`. Elle décompresse un bundle neuf dans
`releases/<release-id>`. `deploy.sh` ne remplace le lien `current` qu'après la
migration, les contrôles de schéma et les healthchecks.

## Conditions obligatoires avant une release candidate

1. Les pipelines backend, frontend et infrastructure sont verts.
2. Les images applicatives utilisent un digest ou un tag SHA Git de 40 caractères ;
   Nginx, PostgreSQL et Redis utilisent obligatoirement un digest sha256.
3. Le contrat OpenAPI du frontend correspond au backend.
4. Le test des migrations couvre base neuve, upgrade et rollback transactionnel.
5. Une sauvegarde locale et une copie chiffrée hors VPS sont disponibles.
6. Une restauration a réussi sur une base isolée.
7. Le runner CI ne se trouve pas sur le VPS applicatif.
8. Le preflight capacité réussit sans `ALLOW_UNDERSIZED_HOST=true`.
9. Une release précédente compatible et son manifeste sont archivés.

## Qualification locale lorsque staging n'est pas disponible

Créer d'abord un tag `v2.0.0-rc.1`. Le PC de qualification doit restaurer une
copie du schéma 105, puis exécuter le bundle exact sous les limites CPU/RAM du
VPS. Le job distant `deploy:staging` reste disponible pour une évolution future.
Exécuter ensuite :

- inscription, vérification email et connexion ;
- création/sélection d'un workspace ;
- invitation et acceptation d'un membre ;
- contrôle OWNER, ADMIN, MEMBER et suspension ;
- rôles projet MAINTAINER, DEVELOPER et VIEWER ;
- création d'un projet et d'un serveur ;
- déploiement manuel et webhook ;
- worker, WebSocket, logs et rollback applicatif ;
- sauvegarde/restauration complète ;
- test de charge et observation mémoire/CPU/disque ;
- répétition d'un rollback de schéma.

Un échec produit une nouvelle RC. Ne jamais réutiliser ou remplacer le contenu
d'un identifiant de release existant.

## Promotion de production

Créer le tag final `v2.0.0` uniquement après validation de la RC. Le job
`deploy:production` doit être manuel, protégé et soumis à approbation dans
GitLab.

Le script applique cet ordre :

1. vérification stricte du manifeste, des secrets et de la capacité ;
2. téléchargement des images avant la maintenance ;
3. activation de la page de maintenance ;
4. arrêt du frontend, de l'API et du worker ;
5. sauvegarde finale sans writer, checksum et métadonnées ;
6. application éventuelle de la configuration PostgreSQL/Redis ;
7. exécution unique du migrateur ;
8. vérification exacte de `SCHEMA_MIGRATION` et absence de migration échouée ;
9. démarrage du backend (`all` en compact, API + worker en split), du frontend et de Nginx ;
10. healthchecks internes puis smoke test HTTPS ;
11. archivage du manifeste et bascule atomique de `current`.

Une erreur après l'ouverture de la maintenance laisse volontairement les
writers arrêtés. Aucun rollback d'image automatique n'est tenté.

## Rollback de schéma

Un rollback après migration incompatible restaure obligatoirement la base et
la release précédente :

```bash
sudo -u deploy SOVRACK_BASE_DIR=/srv/sovrack \
  /srv/sovrack/current/scripts/rollback.sh \
  <ancienne-release> \
  /srv/sovrack/shared/backups/<backup-pre-release>.sql.gz
```

Le fichier `.metadata` du dump doit annoncer la même migration que le manifeste
de l'ancienne release. `restore.sh --mode exact` ne lance jamais le migrateur.
La baseline R0 utilise `RUNTIME_TOPOLOGY=legacy-single`, afin que l'ancien
backend reste l'unique consommateur de jobs. Sur le VPS 3,8 Gio, les releases
Phase 2 utilisent `RUNTIME_TOPOLOGY=compact` et `PROCESS_ROLE=all`. Le mode
`split` reste disponible lorsqu'un worker dédié pourra être hébergé.

`--mode upgrade` est réservé à une restauration volontaire d'un ancien dump
vers la release courante ; il réexécute alors explicitement le migrateur.

L'option `--allow-unverified` permet uniquement de récupérer un ancien dump
sans sidecars. Après import, la vérification du schéma cible reste obligatoire.

## Sauvegardes et hors site

Une sauvegarde standard produit :

```text
sovrack-<date>-<id>.sql.gz
sovrack-<date>-<id>.sql.gz.sha256
sovrack-<date>-<id>.sql.gz.metadata
```

Initialiser une fois le dépôt Restic distant :

```bash
SOVRACK_BASE_DIR=/srv/sovrack \
  /srv/sovrack/current/scripts/backup-offsite.sh --init
```

Après une sauvegarde distante et une restauration testée, activer
`BACKUP_OFFSITE_ENABLED=true`. Installer le timer quotidien :

```bash
sudo /srv/sovrack/current/scripts/install-backup-timer.sh /srv/sovrack
systemctl start sovrack-backup.service
journalctl -u sovrack-backup.service --no-pager
```

Le service est exécuté avec le propriétaire de `shared/` afin que les backups
créés par le timer et ceux créés avant une release gardent le même propriétaire
et puissent être soumis à la même politique de rétention.

### Livraison des alertes dans GitLab

Le monitoring reste utilisable localement sans destinataire externe. Pour
activer le récepteur Prometheus GitLab, créer l'intégration dans
`Settings > Monitor > Alerts`, puis déposer ses deux valeurs hors Git :

```text
/opt/monitoring/secrets/gitlab-alert-url
/opt/monitoring/secrets/gitlab-alert-token
```

Les fichiers doivent appartenir à `root:root` avec le mode `0600`. Le script
`install-external-monitoring.sh` détecte la paire complète, monte les secrets en
lecture seule et route toutes les alertes opérationnelles vers GitLab. Le
watchdog reste volontairement local afin de ne pas créer une alerte permanente.

## TLS

`certbot.sh` écrit directement dans `sovrack-certbot-certs`, le volume lu par
Nginx. `CERTBOT_DOMAINS` doit contenir l'apex et `www`.

```bash
SOVRACK_BASE_DIR=/srv/sovrack ENV_FILE=/srv/sovrack/shared/.env \
  /srv/sovrack/current/scripts/certbot.sh --dry-run
sudo /srv/sovrack/current/scripts/install-certbot-renew.sh /srv/sovrack
systemctl start sovrack-certbot-renew.service
journalctl -u sovrack-certbot-renew.service --no-pager
```

Vérifier ensuite le certificat réellement servi depuis Internet, pas seulement
les fichiers présents dans le conteneur.

## Contrôles post-release

```bash
SOVRACK_BASE_DIR=/srv/sovrack /srv/sovrack/current/scripts/current-compose.sh ps
SOVRACK_BASE_DIR=/srv/sovrack /srv/sovrack/current/scripts/current-compose.sh logs --tail=150 migrator backend worker frontend nginx
curl --fail --silent https://sovrack.tech/backend-api/health
```

Contrôler aussi les métriques authentifiées, les erreurs applicatives, l'espace
disque, les événements OOM, le timer de backup et le timer TLS. Conserver dans
le compte-rendu : release, digests, pipelines, migration avant/après, backup,
opérateur, heure de début/fin et résultat des smoke tests.
