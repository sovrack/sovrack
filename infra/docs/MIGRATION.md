# MIGRATION — prod `da-fares` → `sovrack` (zéro-downtime)

> Contexte : la prod actuelle tourne dans un stack docker nommé `da-fares`,
> dont le `docker-compose.yml` est introuvable et dont Postgres/Redis vivent
> dans **`/tmp/da-instances/fares/data`** (⇒ perte au reboot).
>
> Ce guide recrée une prod propre sur `/srv/sovrack` (projet `sovrack`)
> et migre les données **sans arrêt** de la stack existante.

---

## 0. Règles
- Exécute en tant qu'utilisateur ayant accès à docker (et sudo si besoin).
- **Backup AVANT tout** (étape 1) — jamais en dernier sale.

## 1. Sauvegarde (dump de la DB prod actuelle)
```bash
mkdir -p /srv/sovrack/backups
docker exec da-fares-postgres pg_dump -U da_fares -d deploy_automation \
  | gzip > /srv/sovrack/backups/pre-migration-$(date +%F).sql.gz
ls -lh /srv/sovrack/backups/
```

## 2. Installer ce repo sur le VPS
```bash
sudo mkdir -p /srv/sovrack && sudo chown "$(whoami)": /srv/sovrack
cd /srv/sovrack
git clone git@gitlab.com:deploy-automation/deploy-automation-infra.git .
cp .env.production.example .env
vi .env          # renseignè POSTGRES_*, REDIS_*, JWT_SECRET, CONFIG_SECRET, DOMAIN, SECRET...
./scripts/gen-secrets.sh   # optionnel : outils pour générer des secrets forts
```

## 3. Démarrer la DB/vide cible
```bash
./scripts/bootstrap.sh
docker compose -f docker-compose.prod.yml up -d postgres redis
docker compose -f docker-compose.prod.yml ps    # healthy
```

## 4. Migrer les données (l'ancienne stack reste up)
```bash
gunzip -c /srv/sovrack/backups/pre-migration-$(date +%F).sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T postgres \
      psql -U da_admin -d deploy_automation
```
> Si le schéma fait défaut, lance d'abord `npm i && npx prisma migrate deploy` côté backend pointé vers la nouvelle base.

## 5. Démarrer la stack complète
```bash
./scripts/deploy.sh
docker compose -f docker-compose.prod.yml ps
```

## 6. Bascule DNS / TLS, puis validation, puis cleanup des stacks orphelins
- Voir `CLEANUP.md` + scripts/certbot.sh.