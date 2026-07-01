# Deploy Automation Backend

NestJS backend for the Vaytek internal platform.

## Responsibilities

- Authentication and RBAC (Admin/Developer)
- Projects, environments, deployments
- Remote server onboarding and preparation (control-node Ansible)
- Multi-VPS automation runs
- Real SSH terminal sessions via WebSocket
- Git providers, registry, audit logs, monitoring APIs

## Stack

- NestJS + TypeScript
- Prisma + PostgreSQL
- Socket.IO gateways
- Ansible orchestration from backend/control node

## Setup

```bash
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
```

## Run

```bash
npm run start:dev
```

## Delivery

The repository now includes a GitLab release path in addition to validation.

- `deploy:production` syncs the repository to a remote host over SSH and runs `docker compose up -d --build` there.
- `verify:production` checks the public health endpoint after deployment.

Required GitLab CI variables:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_BASE_URL`
- `DEPLOY_PATH` is optional and defaults to `/opt/deploy-automation/backend`

The remote host must already have Docker Compose available and a valid `.env` file for the backend.

## Main Commands

```bash
npm run build
npm run lint
npm run test
npx prisma validate
```

## Environment Notes

- Session auth uses JWT in HttpOnly cookie.
- Ansible executes only on control node/backend.
- VPS targets remain SSH agentless.
- `CONFIG_SECRET` must be stable across restarts to decrypt stored secrets.
