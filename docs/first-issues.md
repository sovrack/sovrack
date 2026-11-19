# Good First Issues & Contributing Guide

Welcome! We are excited to have you contribute.

## Project Structure
- `apps/server/` : NestJS backend (Prisma ORM, Ansible orchestration, SSH runtime, Docker daemon management).
- `apps/web/` : Next.js 15 App Router frontend (Tailwind CSS, React Query, Lucide icons).
- `infra/` : Docker Compose stacks, Nginx reverse proxy templates, Prometheus monitoring, and systemd timers.
- `ee/` : Optional commercial Enterprise Edition extensions.

## Development Setup
```bash
# 1. Install root dependencies
npm install

# 2. Start local acceptance stack
make dev
```
