#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")" || exit 1

OK=true
echo "=== Ansible Validation ==="
echo ""

# 1. Syntax check all playbooks
echo "--- Syntax check ---"
for pb in playbooks/*.yml; do
  [ -f "$pb" ] || continue
  echo -n "  $pb ... "
  if ansible-playbook --syntax-check "$pb" >/dev/null 2>&1; then
    echo "OK"
  else
    echo "FAIL"
    OK=false
  fi
done

# 2. Check YAML formatting
echo ""
echo "--- YAML lint ---"
if command -v yamllint &>/dev/null; then
  yamllint playbooks/ roles/*/tasks/*.yml roles/*/defaults/*.yml
else
  echo "  yamllint not installed — skipping"
fi

# 3. Check referenced roles exist
echo ""
echo "--- Role coverage ---"
for pb in playbooks/*.yml; do
  [ -f "$pb" ] || continue
  for role in $(grep -oP 'include_role:\s*\n\s+name:\s+\K\w+' "$pb" 2>/dev/null || true); do
    if [ ! -d "roles/$role" ]; then
      echo "  WARNING: $pb references role '$role' but roles/$role/ does not exist"
    fi
  done
done

echo ""
if $OK; then
  echo "=== All checks passed ==="
  exit 0
else
  echo "=== Some checks FAILED ==="
  exit 1
fi
