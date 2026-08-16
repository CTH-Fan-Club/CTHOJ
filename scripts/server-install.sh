#!/usr/bin/env bash
set -euo pipefail

ROLE="${1:-}"
ALLOWED_IP="${2:-}"
[[ "$ROLE" =~ ^(main|judge|all)$ ]] || { echo "Usage: $0 <main|judge|all> [CTHOJ_MAIN_SERVER_IP]" >&2; exit 2; }
if [[ "$ROLE" == "judge" && -z "$ALLOWED_IP" ]]; then
  echo "The judge role requires the CTHOJ main server IP allowlist." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/infra/.env.infrastructure"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi
# Judge0's isolate sandbox uses Linux namespaces/cgroups and does not require
# hardware virtualization on a native Linux host. VMX/SVM is only relevant
# when the installer itself is running through a desktop virtualization layer.
if [[ "$(uname -s)" != "Linux" ]] && ! grep -Eq '(vmx|svm)' /proc/cpuinfo; then
  echo "CPU virtualization is not exposed to this non-Linux host; Judge0 cannot use isolate safely." >&2
  exit 1
fi
if [[ "$(uname -s)" == "Linux" ]] && [[ ! -f /sys/fs/cgroup/cgroup.controllers ]]; then
  echo "Linux cgroup v2 is required for the Judge0 isolate image." >&2
  exit 1
fi
command -v docker >/dev/null || { echo "Install Docker Engine and Compose v2 first." >&2; exit 1; }

"$ROOT/scripts/infra-init.sh"

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

set_env CTHOJ_POSTGRES_BIND_ADDRESS 127.0.0.1
set_env CTHOJ_REDIS_BIND_ADDRESS 127.0.0.1
if [[ "$ROLE" == "judge" ]]; then
  set_env JUDGE0_BIND_ADDRESS 0.0.0.0
  set_env JUDGE0_ALLOW_IP "$ALLOWED_IP"
else
  set_env JUDGE0_BIND_ADDRESS 127.0.0.1
fi

"$ROOT/scripts/infra-init.sh"
"$ROOT/scripts/infra-up.sh" "$ROLE"
echo "Server role '$ROLE' installation completed."
