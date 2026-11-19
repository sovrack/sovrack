# Sovrack 🛡️
### Sovereign Self-Hosted PaaS & Infrastructure Orchestration Platform

[![CI & Quality Gates](https://github.com/sovrack/sovrack/actions/workflows/ci.yml/badge.svg)](https://github.com/sovrack/sovrack/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E.svg?logo=nestjs)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15.x-000000.svg?logo=nextdotjs)](https://nextjs.org/)
[![Docker](https://img.shields.io/badge/Docker-Production%20Ready-2496ED.svg?logo=docker)](https://www.docker.com/)

**Sovrack** is a modern, enterprise-grade, self-hosted PaaS and multi-server infrastructure orchestration platform. Reclaim full sovereignty over your VPS, bare-metal servers, and application fleets from high-cost hyperscalers. Execute automated Nixpacks & Docker builds, stream live container logs, run Ansible hardening, and open secure in-browser xterm.js SSH sessions.

---

### ⚡ 1-Click Automated Install (Linux / VPS)

Install Sovrack Community Edition on your Ubuntu or Debian server in under 2 minutes:

```bash
curl -fsSL https://raw.githubusercontent.com/sovrack/sovrack/main/install.sh | sudo bash
```

*Automatically installs Docker, provisions databases, configures cryptographic secrets, and exposes the dashboard on port `3000`.*

---

### 🏛️ Open-Core Architecture
This repository is organized under an Open-Core model:
- **Community Core (`apps/server`, `apps/web`, `infra`):** 100% Free and Open Source under the **Apache License 2.0**.
- **Enterprise Extensions (`ee/`):** Commercial capabilities (advanced governance, multi-cluster federation, offline license validation) under a proprietary commercial license.

---

### 🛠️ Quick Start (Local Development)

```bash
# Clone the repository
git clone https://github.com/sovrack/sovrack.git
cd sovrack

# Install workspace dependencies
npm ci

# Start the full local stack (Server, Web, Nginx, Postgres, Redis, Mailpit)
make dev
```

Dashboard is available at: `http://localhost:3000`  
API docs: `http://localhost:3001/api`

---

### 🔒 Security & Vulnerabilities
Please see [SECURITY.md](SECURITY.md) for vulnerability disclosure guidelines.
