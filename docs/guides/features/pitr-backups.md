# Sauvegardes Avancées & Restauration Point-In-Time (PITR)

Pour les bases de données de production critiques, un dump quotidien (ex. `pg_dump`) ne suffit pas : en cas d'incident à 17h, toutes les transactions entre le matin et 17h sont perdues (RPO de plusieurs heures).

Sovrack résout cette problématique grâce à l'intégration du streaming continu des **Write-Ahead Logs (WAL)** vers du stockage objet sécurisé S3, permettant une restauration **Point-In-Time (PITR) à la seconde près** (RPO quasi nul).

---

## 📊 Architecture du Streaming WAL

```
+-----------------------------------------------------------+
|                    SERVEUR POSTGRESQL                     |
|                                                           |
|    +------------------+         +--------------------+    |
|    |  Base de données | ------> |  Archive Command   |    |
|    |    PostgreSQL    | (WAL)   |      (pg_dump/     |    |
|    +------------------+         |      wal-g/rclone) |    |
|                                 +--------------------+    |
+-----------------------------------------------------------+
                                             │
                                             │ Upload continu
                                             ▼
                                  +--------------------+
                                  |    Bucket S3 /     |
                                  |   Cloudflare R2    |
                                  |   (Données + WAL)  |
                                  +--------------------+
```

---

## ⚙️ Configuration du WAL Archiving

Sovrack configure automatiquement les directives suivantes dans `postgresql.conf` :

```ini
# Activation du mode archive
wal_level = replica
archive_mode = on

# Commande d'expédition sécurisée vers le stockage S3
archive_command = 'test ! -f /var/lib/postgresql/wal_archive/%f && cp %p /var/lib/postgresql/wal_archive/%f && aws s3 cp /var/lib/postgresql/wal_archive/%f s3://${S3_BUCKET}/wal/${POSTGRES_DB}/%f'
archive_timeout = 60
```

---

## ⏱️ Procédure de Restauration Point-In-Time (PITR)

Pour restaurer une base de données à un instant précis (par exemple, juste avant une suppression accidentelle survenue à 14:32:15 le 23 novembre 2026) :

### Via la CLI Sovrack :
```bash
sovrack pitr restore --service-id=<SERVICE_ID> --target-time="2026-11-23 14:32:00 UTC"
```

### Via l'API REST :
```bash
curl -X POST https://app.sovrack.com/api/v1/backups/pitr/restore \
  -H "Authorization: Bearer $SOVRACK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceId": "svc_prod_db",
    "targetTime": "2026-11-23T14:32:00Z"
  }'
```

### Mécanisme Interne de Restauration :
1. Téléchargement de la dernière sauvegarde de base complète (`Base Backup`) antérieure à l'horodatage cible.
2. Génération du fichier `recovery.signal` dans le répertoire des données PostgreSQL.
3. Injection de la directive de recovery dans `postgresql.auto.conf` :
   ```ini
   restore_command = 'aws s3 cp s3://${S3_BUCKET}/wal/${POSTGRES_DB}/%f %p'
   recovery_target_time = '2026-11-23 14:32:00 UTC'
   recovery_target_action = 'promote'
   ```
4. Démarrage du moteur PostgreSQL : rejeu séquentiel des transactions jusqu'à la seconde exacte spécifiée, puis promotion automatique en mode lecture/écriture standard.
