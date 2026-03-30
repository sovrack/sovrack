# Etat Actuel Du Projet Backend

Document de reference qui decrit l'etat du projet a l'instant present.

## 1) Contexte Snapshot

- Date snapshot: 2026-03-30
- Branche Git active: feature/gitlab-integration
- Type de projet: API NestJS 11 (TypeScript) + Prisma + PostgreSQL
- Domaine: Plateforme Centralisee de Deploiement (interne entreprise)

## 2) Etat Git (travail en cours)

Fichiers modifies/non commits au moment du snapshot:

- M .env.example
- M README.md
- M docker-compose.yml
- M package-lock.json
- M package.json
- M prisma/schema.prisma
- M src/app.module.ts
- M src/main.ts
- M src/projects/projects.service.ts
- ?? prisma.config.ts
- ?? prisma/migrations/20260330003012_add_gitlab/
- ?? src/gitlab/

## 3) Stack Technique

- NestJS 11
- TypeScript
- PostgreSQL 16
- Prisma ORM
- JWT + Passport
- Swagger
- Docker Compose
- GitLab API (Sprint 3)

## 4) Modules Fonctionnels

### Auth

- Login utilisateur
- Profil utilisateur courant (/auth/me)
- JWT Strategy
- Rate limit de login

### Users

- CRUD utilisateurs (reserve ADMIN)
- Activation/desactivation de compte

### Projects

- CRUD projets
- Gestion membres (OWNER/MEMBER)
- Controle d'acces par role/projet

### GitLab (Sprint 3)

- Connexion d'un projet local a un projet GitLab
- Lecture des branches
- Lecture des pipelines
- Trigger manuel de pipeline
- Reception webhook GitLab pipeline
- Synchronisation des pipelines en base locale

## 5) Structure Fichiers (etat courant)

### Racine backend

- .env
- .env.example
- docker-compose.yml
- nest-cli.json
- package.json
- package-lock.json
- prisma.config.ts
- README.md
- tsconfig.json
- tsconfig.build.json
- eslint.config.mjs

### Dossier src/

- app.controller.spec.ts
- app.controller.ts
- app.module.ts
- app.service.ts
- main.ts
- auth/
  - auth.controller.ts
  - auth.module.ts
  - auth.service.ts
  - decorators/get-user.decorator.ts
  - decorators/roles.decorator.ts
  - dto/login.dto.ts
  - guards/jwt-auth.guard.ts
  - guards/login-rate-limit.guard.ts
  - guards/roles.guard.ts
  - strategies/jwt.strategy.ts
- users/
  - users.controller.ts
  - users.module.ts
  - users.service.ts
  - dto/create-user.dto.ts
  - dto/update-user.dto.ts
- projects/
  - projects.controller.ts
  - projects.module.ts
  - projects.service.ts
  - dto/add-member.dto.ts
  - dto/create-project.dto.ts
  - dto/update-project.dto.ts
- gitlab/
  - gitlab.controller.ts
  - gitlab.module.ts
  - gitlab.service.ts
  - dto/connect-gitlab.dto.ts
- prisma/
  - prisma.module.ts
  - prisma.service.ts

### Dossier prisma/

- schema.prisma
- seed.ts
- migrations/migration_lock.toml
- migrations/20260323172924_init/migration.sql
- migrations/20260330003012_add_gitlab/migration.sql

## 6) Modele De Donnees Prisma

### Modeles

- User
- Project
- ProjectMember
- GitlabConfig
- Pipeline

### Enums

- Role: ADMIN, DEVELOPER
- ProjectMemberRole: OWNER, MEMBER
- PipelineStatus: PENDING, RUNNING, SUCCESS, FAILED, CANCELED

### Relations importantes

- User <-> Project via ProjectMember (many-to-many)
- Project -> GitlabConfig (1-1 optionnelle)
- Project -> Pipeline (1-n)

## 7) Configuration Environnement

### .env.example (template partage)

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
JWT_SECRET=CHANGE_ME_WITH_A_STRONG_SECRET
JWT_EXPIRES_IN=24h

# GitLab
GITLAB_URL=https://gitlab.master.ssd.vps.platform.com
GITLAB_TOKEN=ton_token_ici
```

### .env local

- Meme structure que .env.example
- Contient des secrets reels (JWT/GitLab token)
- Ne pas partager publiquement

## 8) Configuration Docker

Fichier: docker-compose.yml

Services:

- database (postgres:16-alpine)
  - port: ${DB_PORT}:5432
  - volume persistant postgres_data
  - healthcheck actif
- backend (node:22-alpine)
  - depends_on database: service_healthy
  - commande: npm install && npm run prisma:generate && npm run start:dev
  - port: ${PORT}:3001

Objectif: lancer toute la stack dev avec une seule commande.

## 9) Scripts npm Disponibles

### Execution

- npm run start
- npm run start:dev
- npm run start:debug
- npm run start:prod

### Docker helpers

- npm run docker:up
- npm run docker:stop
- npm run docker:down
- npm run docker:ps
- npm run docker:logs

### Prisma

- npm run prisma:generate
- npm run prisma:migrate
- npm run prisma:seed
- npm run prisma:studio

### Qualite / tests

- npm run lint
- npm run build
- npm run test
- npm run test:e2e
- npm run test:cov

## 10) API Exposee (resume)

Base URL locale:

- API: http://localhost:3001
- Swagger: http://localhost:3001/api

### Auth

- POST /auth/login
- GET /auth/me

### Users

- POST /users
- GET /users
- GET /users/:id
- PUT /users/:id
- DELETE /users/:id
- PUT /users/:id/toggle-active

### Projects

- POST /projects
- GET /projects
- GET /projects/:id
- PUT /projects/:id
- DELETE /projects/:id
- POST /projects/:id/members
- GET /projects/:id/members
- DELETE /projects/:id/members/:userId

### GitLab

- POST /projects/:id/gitlab/connect
- GET /projects/:id/gitlab/branches
- GET /projects/:id/gitlab/pipelines
- POST /projects/:id/gitlab/pipelines/trigger
- GET /projects/:id/gitlab/config
- POST /gitlab/webhook

## 11) Comptes Seed

- ADMIN: admin@devops.com / Admin@2025!
- DEVELOPER: dev@devops.com / Dev@2025!

## 12) Etat Validation Technique

Etat observe pendant les verifications recentes:

- docker-compose config: OK
- migrations Prisma: OK
- lint: OK
- build: OK
- tests unitaires: OK
- tests e2e: OK
- demarrage start:dev: OK

## 13) Commandes De Demarrage Rapide

### Option Docker (recommandee)

```bash
cd backend
npm install
npm run docker:up
npm run docker:ps
```

### Option locale sans Docker

```bash
cd backend
npm install
npm run prisma:generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev
```

## 14) Points D'attention

- Les secrets doivent rester dans .env local.
- Pour webhook GitLab, le header X-Gitlab-Token doit correspondre a GITLAB_TOKEN.
- Le module GitLab masque le token dans les reponses API (***).
- En cas de conflit de ports, ajuster PORT/DB_PORT dans .env et relancer la stack.

## 15) Fichiers Documentation Disponibles

- README.md: guide principal d'installation et d'usage
- PROJECT_STATE.md: photographie detaillee de l'etat courant
