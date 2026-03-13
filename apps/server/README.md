# DevOps Platform Backend

Backend de la Plateforme Centralisee de Deploiement (projet interne entreprise).

## Etat actuel (Sprint 1 termine)

- NestJS 11 + TypeScript
- PostgreSQL 16
- Prisma
- Authentification JWT + Passport
- Roles: `ADMIN` et `DEVELOPER`
- Hash des mots de passe avec bcrypt
- Swagger actif sur `/api`
- Guards actifs:
  - `JwtAuthGuard`
  - `RolesGuard`
  - `LoginRateLimitGuard` (5 tentatives/minute/IP)

## API disponible

### Auth

- `POST /auth/login`
- `GET /auth/me`

### Users (ADMIN uniquement)

- `POST /users`
- `GET /users`
- `GET /users/:id`
- `PUT /users/:id`
- `DELETE /users/:id`
- `PUT /users/:id/toggle-active`

## Lancement rapide

```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed

npm run start:dev
```

## Variables d'environnement minimales

```env
DATABASE_URL="postgresql://user:password@localhost:5432/devops_platform"
JWT_SECRET=change_me
JWT_EXPIRES_IN=24h
```

## Comptes seed par defaut

- ADMIN: `admin@devops.com` / `Admin@2025!`
- DEVELOPER: `dev@devops.com` / `Dev@2025!`

## Liens utiles

- API: `http://localhost:3001`
- Swagger: `http://localhost:3001/api`
