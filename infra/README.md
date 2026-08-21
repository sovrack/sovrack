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
│   ├── certbot.sh              # obtient/renouvelle TLS via Let's Encrypt
│   └── install-certbot-renew.sh # installe le cron de renouvellement
├── docs/
│   ├── MIGRATION.md            # migration prod da-fares → sovrack (zéro-downtime)
│   ├── CLEANUP.md              # nettoyage VPS après migration
│   └── RELEASE_RUNBOOK.md      # promotion, rollback, restore et TLS
├── .gitlab-ci.yml              # CI: job deploy vers le VPS
└── README.md
```

---

## 🚀 Déploiement manuel (1ère fois)

```bash
# 1) Sur le VPS (avec les droits sudo)
sudo mkdir -p /srv/sovrack && sudo chown "$(whoami)": /srv/sovrack
git clone git@gitlab.com:deploy-automation/deploy-automation-infra.git /srv/sovrack
cd /srv/sovrack

# 2) Initialiser puis renseigner les secrets et les deux images immuables
./scripts/bootstrap.sh
vi .env

# 3) Premier démarrage applicatif
./scripts/deploy.sh

# 4) Obtenir le certificat après résolution du DNS
./scripts/certbot.sh

# 5) Vérifier
make ps   # doit montrer sovrack-* healthy/up
```

---

## 🔄 CI/CD (recommandé)

Le `.gitlab-ci.yml` propose une promotion **manuelle** depuis `main`, via rsync
et Docker Compose, après que les images backend et frontend ont été produites.
La CI transmet leurs références immuables ; `deploy.sh` ne les persiste sur le
VPS qu'après les contrôles de santé.

Il attend les variables CI/CD GitLab :
| Variable | Usage |
|---|---|
| `PRODUCTION_HOST` | IP/hostname du VPS |
| `PRODUCTION_USER` | utilisateur SSH (ex `deploy`), avec clé autorisée |
| `SSH_PRIVATE_KEY_B64` | clé SSH de déploiement encodée en base64 |
| `SSH_KNOWN_HOSTS` | empreinte SSH vérifiée hors bande |
| `DEPLOY_PATH` | chemin cible sur le VPS (ex `/srv/sovrack`) |
| `BACKEND_IMAGE` | image backend avec SHA Git complet ou digest |
| `FRONTEND_IMAGE` | image frontend avec SHA Git complet ou digest |

Le job reste manuel et doit aussi être protégé dans les paramètres GitLab de
l'environnement `production`.

---

## 🗄️ Sauvegardes

```bash
# Manuel (production)
./scripts/backup.sh              # → backups/sovrack-<date>.sql.gz + .sha256
# Automatique (recommandé) — ajouter au crontab du VPS :
#   30 2 * * * /srv/sovrack/scripts/backup.sh
```

Les données sont **hors /tmp** (volumes Docker nommés `pgdata`, `redisdata`) : aucune perte au reboot.

---

## 🔒 Certificat TLS (Let's Encrypt)

```bash
# Obtention initiale
make certbot

# Installe une vérification deux fois par jour, sans renouvellement forcé
sudo ./scripts/install-certbot-renew.sh /srv/sovrack
# Test manuel : ./scripts/certbot.sh --renew
```

La cible `make certbot-renew` est idempotente : Certbot ne renouvelle que si
nécessaire. Au tout premier démarrage, Nginx n'invente pas de certificat ; il
sert uniquement le challenge ACME jusqu'à l'obtention du vrai certificat.

Le déroulé opérationnel complet se trouve dans
[`docs/RELEASE_RUNBOOK.md`](docs/RELEASE_RUNBOOK.md).

---

## 🔐 Bonnes pratiques
- Secrets **jamais commit** (`.env` gitignoré ; seul `.env.production.example`).
- Serveur DB/Redis **non publié** publiquement (`127.0.0.1`).
- Un seul jeu d'images : `registry.gitlab.com/deploy-automation/deploy-automation-{backend,frontend}`.
- Une seule instance worker BullMQ (pas de doublons).
- Reverse-proxy nginx = TLS + en-têtes de sécurité + routage propre.
