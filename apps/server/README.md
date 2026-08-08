# Deploy Automation Backend

NestJS backend for the Sovrack platform.

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

This repository never deploys itself (a control plane must not be its own
workload). CI only builds and publishes:

- `build:image` (stage `build`, Kaniko) builds the Docker image and pushes it
  to this project's GitLab Container Registry, tagged `:$CI_COMMIT_SHORT_SHA`
  and `:latest`. Runs only `if: $CI_COMMIT_BRANCH == "main"`.

Actual production deployment (pulling the image, running migrations,
starting the containers) lives in the separate **`deploy-automation-infra`**
repository — see its README for install/update/rollback.

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
- Exception: the `postgres`, `redis` and `traefik` Ansible roles install the Python Docker
  SDK (`pip`) on the target VPS, required by the idempotent `community.docker.docker_container`
  module (see `ansible/roles/docker_sdk`). This is a targeted, documented exception to the
  "no persistent Ansible agent" principle above, not a contradiction of it — no daemon is
  installed, only a Python library used by Ansible during the SSH-driven run.
- `CONFIG_SECRET` must be stable across restarts to decrypt stored secrets.
- `FRONTEND_URL` (or `FRONTEND_URLS`, comma-separated) is **required** when
  `NODE_ENV=production` — boot fails fast otherwise (`boot-helpers.ts`). Also
  drives the CORS allow-list, so it must match the exact origin used in the
  browser.
- `AUTH_COOKIE_SECURE` defaults to `NODE_ENV === 'production'` if unset. A
  `Secure` cookie is silently dropped by browsers over plain HTTP — set this
  to `false` explicitly until HTTPS is in front, or logins will appear to
  succeed (`201`) while the session never sticks.
- `TRUST_PROXY` must be set (e.g. `1`) once a reverse proxy (Caddy, Traefik)
  sits in front of the backend — otherwise every request appears to come
  from the proxy's IP, which breaks the per-IP login rate-limiter for all
  users at once.
