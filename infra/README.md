# Sovrack — Infrastructure (déploiement / orchestration)

Dépôt **séparé** (best practice GitOps) qui pilote le **déploiement de production**
du produit Sovrack. Il contient **UNIQUE** la configuration d'orchestration :
le `docker-compose.prod.yml`, le reverse-proxy nginx, les templates de secrets,
les scripts de déploiement/sauvegarde et le pipeline CI de production.

> ⚠️ Ce dépôt **ne contient pas le code applicatif**. Le code vit dans
> `deploy-automation-backend` et `deploy-automation-frontend`.
> Ce repo **peut** être séparé car chaque repo a son rôle :
> `backend` / `frontend` = production d'images, `infra` = quand + comment elles tournent.

---

## 🧱 Architecture cible (1 seule production, no multi-instances)

```
[ Internet / HTTPS :443 ]
          │
    ┌─────▼────────── nginx (reverse-proxy) ──────────┐
│    sovrack-proxy                              │
│        ├── https://sovrack.tech         → frontend │
│        └── https://sovrack.tech/backend-api → backend │
    └──────────────┬────────────────┬──────────────────┘
                   │                │
          ┌────────▼─────┐  ┌───────▼────────┐
          │  sovrack-  │  │  sovrack-    │
          │  frontend    │  │  backend       │
          │  (Next.js)   │  │  (NestJS+worker)│
          └──────┬───────┘  └───────┬────────┘
                 │                  │
                 └────────┬─────────┘
                    ┌─────▼─────┐        ┌─────▼────┐
                    │ sovrack-│        │ sovrack│
                    │ postgres  │        │  redis   │
                    │ (127.0.0.1)│        │  (127.0.0.1)│
                    └───────────┘        └──────────┘
```

- **Un seul projet compose** : `sovrack`
- **postgres / redis** bindés sur `127.0.0.1` (jamais exposés publiquement)
- **nginx** = seule porte d'entrée publique (port 80/443)
- **données** : volumes Docker nommés (`pgdata`, `redisdata`) — persistant, hors `/tmp`

---

## 📁 Structure

```
deploy-automation-infra/
├── docker-compose.prod.yml     # la seule stack de production
├── .env.production.example     # template des secrets (à copier en .env)
├── nginx/
│   ├── proxy.conf.template      # conf reverse proxy / HTTPS (${DOMAIN} injecté)
│   └── security-headers.conf    # en-têtes de sécurité (HSTS, CSP…) — non-menu
├── scripts/
│   ├── bootstrap.sh            # init 1ère fois (dossier, dirs, .env)
│   ├── deploy.sh               # pull images + up -d stack
│   ├── backup.sh               # pg_dump + rotation (à câbler en cron)
│   ├── restore.sh              # restore d'un dump
│   ├── gen-secrets.sh          # génère des secrets forts pour .env
│   └── certbot.sh              # obtient/réalise TLS via Let's Encrypt
├── docs/
│   ├── MIGRATION.md            # migration prod da-fares → sovrack (zéro-downtime)
│   └── CLEANUP.md              # nettoyage VPS après migration
├── .gitlab-ci.yml              # CI: job deploy vers le VPS
└── README.md
```

---

## 🚀 Déploiement manuel (1ère fois)

```bash
# 1) Sur le VPS (avec les droits sudo)
sudo mkdir -p /srv/sovrack && sudo chown $(whoami): /srv/sovrack
cd /srv/sovrack
cp /chemin/.env.production.example .env        # puis renseigne les secrets
vi .env                                       # ⚠️ secrets réels

# 2) Cloner ce repo dans /srv/sovrack (ou copier les fichiers)
git clone git@gitlab.com:deploy-automation/deploy-automation-infra.git .

# 3) Premier démarrage
./scripts/bootstrap.sh   # crée les dossiers + valide docker + génère .env si absent
./scripts/deploy.sh      # docker compose pull && up -d

# 4) Vérifier
docker compose ps   # doit montrer sovrack-* healthy/up
```

---

## 🔄 CI/CD (recommandé)

Le `.gitlab-ci.yml` déploye automatiquement le contenu d'une branche `main` vers
le VPS **via rsync + docker compose up -d**, après que les images `backend` et
`frontend` ont été poussées par leur propre CI (build:image).

Il attend les variables CI/CD GitLab :
| Variable | Usage |
|---|---|
| `PRODUCTION_HOST` | IP/hostname du VPS |
| `PRODUCTION_USER` | utilisateur SSH (ex `deploy`), avec clé autorisée |
| `SSH_PRIVATE_KEY` | clé SSH d'deployment (déployer du pipeline) |
| `DEPLOY_PATH` | chemin cible sur le VPS (ex `/srv/sovrack`) |

> Tant que ces variables ne sont pas définies, **le job est désactivé**
> (`rules: when: never`) pour ne pas échouer le pipeline.

---

## 🗄️ Sauvegardes

```bash
# Manuel (production)
./scripts/backup.sh                       # → /srv/sovrack/backups/backup-<date>.sql
# Automatique (recommandé) — ajouter au crontab du VPS :
#   30 2 * * * /srv/sovrack/scripts/backup.sh
```

Les données sont **hors /tmp** (volumes Docker nommés `pgdata`, `redisdata`) : aucune perte au reboot.

---

## 🔒 Certificat TLS (Let's Encrypt)

```bash
# Obtention initiale
DOMAIN=sovrack.tech make certbot

# Renouvellement (à câbler en cron sur le VPS, ex. le 1er de chaque mois)
#   0 3 1 * * cd /srv/sovrack && make certbot-renew >> /var/log/certbot-renew.log 2>&1
# (ou : DOMAIN=sovrack.tech ./scripts/certbot.sh --renew)
```

Sans renouvellement automatique, le certificat expire après ~90 jours → le site
passe en erreur TLS. La cible `make certbot-renew` est idempotente (certbot ne
renouvelle que si proche de l'expiration).

---

## 🔐 Bonnes pratiques
- Secrets **jamais commit** (`.env` gitignoré ; seul `.env.production.example`).
- Serveur DB/Redis **non publié** publiquement (`127.0.0.1`).
- Un seul jeu d'images : `registry.gitlab.com/deploy-automation/deploy-automation-{backend,frontend}`.
- Une seule instance worker BullMQ (pas de doublons).
- Reverse-proxy nginx = TLS + haeder de sécurité + routage propre.