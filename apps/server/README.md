# Plateforme Centralisee de Deploiement - Backend

Backend NestJS de la plateforme interne qui permet aux developpeurs de deployer des applications sur VPS sans expertise DevOps avancee.

## Sommaire

1. [Vision Du Projet](#vision-du-projet)
2. [Stack Technique](#stack-technique)
3. [Fonctionnalites Livrees](#fonctionnalites-livrees)
4. [Architecture Du Backend](#architecture-du-backend)
5. [Modules Et Responsabilites](#modules-et-responsabilites)
6. [Modele De Donnees Prisma](#modele-de-donnees-prisma)
7. [Configuration Environnement .env](#configuration-environnement-env)
8. [Installation Et Preparation](#installation-et-preparation)
9. [Lancement Du Projet](#lancement-du-projet)
10. [Scripts Disponibles](#scripts-disponibles)
11. [Routes API](#routes-api)
12. [GitLab Integration (Sprint 3)](#gitlab-integration-sprint-3)
13. [Tests Et Qualite](#tests-et-qualite)
14. [Troubleshooting Rapide](#troubleshooting-rapide)

## Vision Du Projet

La Plateforme Centralisee de Deploiement permet de:

- gerer des utilisateurs (ADMIN/DEVELOPER),
- gerer des projets applicatifs,
- connecter des projets a GitLab,
- lister branches et pipelines,
- declencher des pipelines,
- recevoir des webhooks GitLab.

Objectif: offrir une experience de deploiement unifiee et simple pour les equipes internes.

## Stack Technique

- NestJS 11
- TypeScript
- PostgreSQL 16
- Prisma ORM
- JWT + Passport
- Swagger OpenAPI
- Docker Compose (dev local)
- GitLab API (integration CI/CD)

## Fonctionnalites Livrees

- Authentification JWT complete
- Roles: ADMIN, DEVELOPER
- Guard de roles + guard JWT
- Rate limiting de login (5 tentatives/min/IP)
- CRUD Users (reserve ADMIN)
- Module Projects (many-to-many via ProjectMember)
- Module GitLab:
  - connexion projet <-> repo GitLab
  - lecture branches
  - lecture pipelines
  - trigger pipeline manuel
  - traitement webhook pipeline

## Architecture Du Backend

```text
src/
  auth/
  users/
  projects/
  gitlab/
  prisma/
  app.module.ts
  main.ts
prisma/
  schema.prisma
  seed.ts
  migrations/
docker-compose.yml
prisma.config.ts
```

## Modules Et Responsabilites

- AuthModule: login, profil courant, strategie JWT, guards
- UsersModule: gestion utilisateurs (ADMIN)
- ProjectsModule: gestion projets + membres
- GitlabModule: API GitLab + webhook + synchronisation pipelines
- PrismaModule: acces DB centralise via PrismaService

## Modele De Donnees Prisma

Entites principales:

- User
- Project
- ProjectMember (relation many-to-many User <-> Project)
- GitlabConfig (config GitLab par projet)
- Pipeline (historique/synchro des pipelines)

Enums:

- Role: ADMIN, DEVELOPER
- ProjectMemberRole: OWNER, MEMBER
- PipelineStatus: PENDING, RUNNING, SUCCESS, FAILED, CANCELED

## Configuration Environnement .env

Le projet utilise les variables suivantes (etat actuel):

```env
# App
PORT=3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=devops_platform

# Prisma
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/devops_platform

# JWT
JWT_SECRET=dev_only_change_me_please_2026
JWT_EXPIRES_IN=24h

# GitLab
GITLAB_URL=https://gitlab.master.ssd.vps.platform.com
GITLAB_TOKEN=glpat-placeholder-sampleam86MQp1OjRuCA.01.0y0ngymqx
```

Notes:

- `GITLAB_TOKEN` sert aussi a verifier le header `X-Gitlab-Token` du webhook.
- En production, ne jamais committer un token reel.

## Installation Et Preparation

Prerequis:

- Node.js 22+
- npm
- Docker + Docker Compose (recommande)

Installation:

```bash
cd backend
npm install
```

Generation Prisma client:

```bash
npm run prisma:generate
```

Migration DB:

```bash
npx prisma migrate dev --name init
```

Seed initial:

```bash
npm run prisma:seed
```

## Lancement Du Projet

### Option 1 (recommandee): via Docker Compose

```bash
npm run docker:up
```

Verifier:

```bash
npm run docker:ps
```

Logs:

```bash
npm run docker:logs
```

Arreter:

```bash
npm run docker:stop
```

Nettoyage complet (supprime aussi les donnees DB):

```bash
npm run docker:down
```

### Option 2: execution locale

1. S'assurer que PostgreSQL est disponible sur `localhost:5432`
2. Executer:

```bash
npm run start:dev
```

## Scripts Disponibles

```bash
# Build / execution
npm run build
npm run start
npm run start:dev
npm run start:debug
npm run start:prod

# Docker helpers
npm run docker:up
npm run docker:stop
npm run docker:down
npm run docker:ps
npm run docker:logs

# Qualite / tests
npm run lint
npm run test
npm run test:e2e
npm run test:cov

# Prisma
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run prisma:studio
```

## Routes API

Base URL locale:

- API: `http://localhost:3001`
- Swagger: `http://localhost:3001/api`

### Auth

- `POST /auth/login`
- `GET /auth/me`

### Users (ADMIN only)

- `POST /users`
- `GET /users`
- `GET /users/:id`
- `PUT /users/:id`
- `DELETE /users/:id`
- `PUT /users/:id/toggle-active`

### Projects

- `POST /projects`
- `GET /projects`
- `GET /projects/:id`
- `PUT /projects/:id`
- `DELETE /projects/:id`
- `POST /projects/:id/members`
- `GET /projects/:id/members`
- `DELETE /projects/:id/members/:userId`

### GitLab

- `POST /projects/:id/gitlab/connect`
- `GET /projects/:id/gitlab/branches`
- `GET /projects/:id/gitlab/pipelines`
- `POST /projects/:id/gitlab/pipelines/trigger`
- `GET /projects/:id/gitlab/config`
- `POST /gitlab/webhook` (sans JWT, avec header `X-Gitlab-Token`)

## GitLab Integration (Sprint 3)

Workflow type:

1. Creer un projet local (`/projects`)
2. Connecter le projet a GitLab (`/projects/:id/gitlab/connect`)
3. Lister les branches (`/branches`)
4. Lister les pipelines (`/pipelines`)
5. Declencher un pipeline (`/pipelines/trigger`)
6. Recevoir les updates de statut via `/gitlab/webhook`

Regles d'acces:

- Connexion GitLab: OWNER du projet ou ADMIN
- Branches/pipelines/config/trigger: membre du projet ou ADMIN

## Tests Et Qualite

Checklist rapide avant commit:

```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

Etat attendu: toutes les commandes passent sans erreur.

## Comptes Seed Par Defaut

- ADMIN: `admin@devops.com` / `Admin@2025!`
- DEVELOPER: `dev@devops.com` / `Dev@2025!`

## Troubleshooting Rapide

### 1) Erreur Prisma `P1001` (DB inaccessible)

- Verifier les conteneurs:

```bash
npm run docker:ps
```

- Redemarrer la stack:

```bash
npm run docker:stop
npm run docker:up
```

### 2) Port DB ou API deja utilise

- Adapter `DB_PORT` ou `PORT` dans `.env`
- Puis relancer `npm run docker:up`

### 3) Swagger n'apparait pas

- Verifier que l'API tourne
- Ouvrir `http://localhost:3001/api`

### 4) Token GitLab invalide sur webhook

- Verifier le header `X-Gitlab-Token`
- Verifier `GITLAB_TOKEN` dans `.env`
