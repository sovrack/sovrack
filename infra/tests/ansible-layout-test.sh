#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  ansible/ansible.cfg
  ansible/inventory.example.yml
  ansible/requirements.yml
  ansible/playbooks/prepare-host.yml
  ansible/roles/sovrack_host/defaults/main.yml
  ansible/roles/sovrack_host/tasks/main.yml
  ansible/roles/sovrack_host/handlers/main.yml
  ansible/roles/sovrack_host/templates/docker-daemon.json.j2
)

for relative_path in "${required_files[@]}"; do
  [ -s "$ROOT/$relative_path" ] || {
    echo "ERROR: fichier Ansible absent : $relative_path"
    exit 1
  }
done

grep -q 'host_key_checking = True' "$ROOT/ansible/ansible.cfg"
grep -q 'sovrack_disable_ssh_password_auth: false' \
  "$ROOT/ansible/roles/sovrack_host/defaults/main.yml"
grep -q 'community.general.ufw' \
  "$ROOT/ansible/roles/sovrack_host/tasks/main.yml"
grep -q 'no-new-privileges:true' "$ROOT/docker-compose.prod.yml"

if grep -RniE '(BEGIN (RSA|OPENSSH) PRIVATE KEY|glpat-|gldt-|glrt-)' \
  "$ROOT/ansible"; then
  echo 'ERROR: secret détecté dans les sources Ansible.'
  exit 1
fi

echo 'Ansible host preparation layout tests passed.'
