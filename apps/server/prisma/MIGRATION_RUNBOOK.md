# Migration Runbook — Deploy Automation backend

> Procédure obligatoire pour appliquer des migrations Prisma **destructives**
> (qui suppriment des tables/colonnes ou des données). But : zéro perte de
> données par migration rejouée sur une base non préparée.

## Procédure générale (toujours, dans cet ordre)

1. **Backup** de la base (ou au minimum des tables impactées) — voir commandes
   par migration ci-dessous.
2. **Backfill** : exécuter les scripts de backfill requis par la migration
   AVANT `migrate deploy` (sinon les colonnes sont droppées avant que les
   données aient été recopiées).
3. **Garde automatique** :
   ```bash
   npm run db:migrate:safe
   ```
   Ce script lance `src/scripts/pre-migrate-check.ts` (vérifie les préconditions des
   migrations destructives **en attente**) puis `prisma migrate deploy`. Si une
   précondition échoue (orphelins, backfill manquant), il **refuse** de migrer.
4. **Vérification post-migration** : exécuter la requête de contrôle de la
   migration concernée et confirmer 0 incohérence.

### Ordre des scripts de backfill (modèle déclaratif M3)

```
1) ts-node prisma/backfill-service-model.ts   # Config→Project.env, EnvironmentConfig→Environment.env,
                                              # ProjectService+AppProviderLink→Service, ManagedService→Service(DATABASE)
2) ts-node prisma/backfill-fk-references.ts    # Deployment/Build.serviceId : ancien ProjectService.id → nouveau Service.id
```

`backfill-fk-references` DÉPEND de `backfill-service-model` (les nouveaux
`Service` doivent exister avant de re-pointer les FK). Ne jamais inverser.

---

## Migrations destructives connues

> Les migrations ci-dessous sont **historiques** (déjà appliquées en juin 2026).
> Ce runbook documente leurs préconditions pour : (a) toute base restaurée d'un
> backup antérieur, (b) tout nouvel environnement rejouant l'historique, (c) le
> modèle à suivre pour les futures migrations destructives.

### `20260610130000_drop_old_models`
- **Supprime** : tables `Config`, `EnvironmentConfig`, `ProjectService`,
  `EnvironmentServiceTarget`, `ManagedService`, `GitlabConfig` + colonnes legacy
  sur `Project`/`Environment`/`Volume`/`ProxyRule`.
- **Prérequis (backfill)** : `backfill-service-model.ts` PUIS
  `backfill-fk-references.ts`.
- **Vérification AVANT** (doit renvoyer 0) :
  ```sql
  SELECT count(*) FROM "Deployment" d
   WHERE d."serviceId" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM "Service" s WHERE s.id = d."serviceId");
  ```
- **Backup** :
  ```bash
  pg_dump "$DATABASE_URL" \
    -t '"ProjectService"' -t '"ManagedService"' -t '"Config"' \
    -t '"EnvironmentConfig"' -t '"EnvironmentServiceTarget"' -t '"GitlabConfig"' \
    > backup_drop_old_models_$(date +%F).sql
  ```
- **Vérification APRÈS** (doit renvoyer 0) :
  ```sql
  SELECT count(*) FROM "Deployment" WHERE "serviceId" IS NOT NULL
     AND "serviceId" NOT IN (SELECT id FROM "Service");
  ```

### `20260612154424_drop_project_env`
- **Supprime** : colonne `Project.env` (avertissement Prisma : *« All the data
  in the column will be lost »*).
- **Prérequis** : les variables au niveau Project ont été migrées vers
  `Service.env` / `Environment.env` (via `backfill-service-model.ts`).
- **Backup** :
  ```bash
  psql "$DATABASE_URL" -c "\copy (SELECT id, env FROM \"Project\" WHERE env IS NOT NULL) TO 'backup_project_env_$(date +%F).csv' CSV HEADER"
  ```
- **Vérification AVANT** (informatif — nombre de projets avec un env non vide
  qui sera perdu si non backfillé) :
  ```sql
  SELECT count(*) FROM "Project" WHERE env IS NOT NULL AND env <> '' AND env <> '{}';
  ```

### `20260612154050_drop_serviceenvironment_repopath`
- **Supprime** : colonne `ServiceEnvironment.repoPath`.
- **Prérequis** : `Service.repoPath` est la source de vérité (le repo est
  défini au niveau Service depuis M3).
- **Backup** :
  ```bash
  psql "$DATABASE_URL" -c "\copy (SELECT id, \"repoPath\" FROM \"ServiceEnvironment\" WHERE \"repoPath\" IS NOT NULL) TO 'backup_se_repopath_$(date +%F).csv' CSV HEADER"
  ```
- **Vérification AVANT** (doit renvoyer 0 — toute valeur encore présente est
  reflétée côté Service) :
  ```sql
  SELECT count(*) FROM "ServiceEnvironment" se
   WHERE se."repoPath" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM "Service" s
        WHERE s.id = se."serviceId" AND s."repoPath" = se."repoPath");
  ```

### Autres migrations destructives (sans donnée métier à risque)
- `20260604180547_drop_deployment_legacy_build_fields` — colonnes build legacy
  recopiées dans la table `Build` (migration `add_build_table`).
- `20260606210000_drop_project_autodeploy` — `Project.autoDeploy*` (la feature a
  été supprimée).
- `20260607190000_drop_orphaned_enums` — enums orphelins après refonte.

Pour ces trois, un `pg_dump` complet de la base avant migration suffit ; aucune
recopie de données n'est requise.

---

## Restauration d'urgence

Si une migration destructive a été appliquée par erreur sans backfill :
```bash
# 1. Stopper le backend.
# 2. Restaurer le dump le plus récent :
psql "$DATABASE_URL" < backup_<migration>_<date>.sql
# 3. Re-jouer le backfill manquant, puis npm run db:migrate:safe.
```
