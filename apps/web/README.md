# Sovrack Frontend

Next.js + TypeScript UI for the Sovrack developer platform.

## Surfaces principales

- site public, documentation, statut et pages juridiques ;
- console client : projets, environnements, services et déploiements ;
- infrastructure client : serveurs distants, clés SSH et terminal ;
- intégrations : GitHub, GitLab et registres privés ;
- espaces personnels et organisations ;
- back-office staff isolé sur son propre domaine.

L’automatisation générale multi-serveurs est conservée dans le code mais n’est
pas exposée dans la V1. Les bases proposées sont des conteneurs exécutés sur le
serveur du client, pas un service de base de données managé.

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
npm run test
npm run test:browser
npm run build
```

## Production build

`build:image` utilise BuildKit rootless et publie une image identifiée par le
SHA complet du commit. Les URLs publiques sont intégrées à la construction :
leur modification exige donc une nouvelle image. Ce dépôt ne se déploie jamais
lui-même ; la qualification des images et la promotion immuable sont réalisées
par `deploy-automation-infra`.
