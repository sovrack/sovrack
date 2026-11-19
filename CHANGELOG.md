# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-10-24

### Added
- **Unified Monorepo:** npm workspaces structure joining Server, Web, and Infra.
- **Automated S3 Backups:** Cloudflare R2, AWS S3, and MinIO backup streaming with SigV4 authentication.
- **Discord Notifications:** Deployment and health alerts dispatching.
- **Google OAuth:** Secure identity provider with domain gating.
- **Open-Core Architecture:** Apache-2.0 open-source core with isolated commercial `ee/` folder.
- **1-Click Installer:** Automated Linux host provisioning script (`install.sh`).
- **Brand Automation:** Seamless brand switching via `apply-brand.ps1`.

### Security
- Purged all legacy third-party references, tokens, and outdated TLS assets.
- Integrated automated Gitleaks secret scanning in continuous integration.
