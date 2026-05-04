# Deploy Automation Frontend

Next.js + TypeScript UI for the Vaytek internal developer platform.

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
