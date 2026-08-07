#!/usr/bin/env bash
# =============================================================================
# Sovrack — Génère des secrets forts (.env-ready)
# -----------------------------------------------------------------------------
# Imprime les valeurs à copier dans .env. Utilise openssl.
# Usage : ./scripts/gen-secrets.sh
# =============================================================================
set -euo pipefail

gen() { openssl rand -hex 48; }   # 96 hex chars (48 bytes = 384 bits)

echo "# ── Sovrack secrets générés (copie dans .env, puis n'apprends jamais) ──"
echo
echo "JWT_SECRET=$(gen)"
echo "STAFF_JWT_SECRET=$(gen)"
echo "CONFIG_SECRET=$(gen)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "REDIS_PASSWORD=$(openssl rand -hex 24)"
echo "STAFF_ROOT_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' )"
echo
echo "👉 NB : CONFIG_SECRET doit ≥32 chars (48 octets ✓). JWT ≥32 (✓)."
echo "⚠️  Change aussi STAFF_ROOT_PASSWORD si le compte ROOT existe déjà."