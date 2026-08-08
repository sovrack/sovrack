# Deploy Automation Frontend

Next.js + TypeScript UI for the Sovrack developer platform.

## Main Areas

- Operations: dashboard, projects, builds, pipelines, deployments
- Infrastructure Ops: remote servers, terminal, automation, monitoring
- Settings: platform settings, SSH keys, git providers, registry, audit logs

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- React Query
- Socket.IO client (live logs and terminal)

## Setup

```bash
npm install
cp .env.example .env.local
```

Required env values:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

## Run

```bash
npm run dev
```

## Main Commands

```bash
npm run lint
npm run type-check
npm run build
```

## Production build

`build:image` (CI, Kaniko) builds the Docker image on every merge to `main`
and pushes it to this project's GitLab Container Registry. `NEXT_PUBLIC_API_URL`
and `NEXT_PUBLIC_WS_URL` are baked in at build time from the `PUBLIC_API_URL`
CI/CD variable — changing them requires a new image, not just a container
restart. This repo does not deploy itself: the actual production rollout
(pulling the image, restarting containers) lives in `deploy-automation-infra`.
