#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA="$ROOT/infra"
ENV_FILE="$INFRA/.env.infrastructure"
EXAMPLE="$INFRA/.env.infrastructure.example"
RUNTIME="$INFRA/runtime"

if [[ "${1:-}" != "--skip-docker-check" ]]; then
  command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }
  docker info >/dev/null || { echo "Docker engine is not running." >&2; exit 1; }
  docker compose version >/dev/null || { echo "Docker Compose v2 is required." >&2; exit 1; }
fi

mkdir -p "$RUNTIME"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  while grep -q '__GENERATE_HEX_32__' "$ENV_FILE"; do
    secret="$(openssl rand -hex 32)"
    sed -i "0,/__GENERATE_HEX_32__/s//$secret/" "$ENV_FILE"
  done
  chmod 600 "$ENV_FILE"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

rendered="$(cat "$INFRA/judge0.conf.template")"
variables=(
  JUDGE0_WORKERS JUDGE0_MAX_QUEUE_SIZE JUDGE0_ALLOW_IP JUDGE0_AUTH_HEADER
  JUDGE0_AUTH_TOKEN JUDGE0_REDIS_PASSWORD JUDGE0_POSTGRES_DB
  JUDGE0_POSTGRES_USER JUDGE0_POSTGRES_PASSWORD JUDGE0_CPU_TIME_LIMIT
  JUDGE0_MAX_CPU_TIME_LIMIT JUDGE0_MEMORY_LIMIT JUDGE0_MAX_MEMORY_LIMIT
)
for variable in "${variables[@]}"; do
  value="${!variable:-}"
  rendered="${rendered//\$\{$variable\}/$value}"
done
printf '%s\n' "$rendered" > "$RUNTIME/judge0.conf"
chmod 600 "$RUNTIME/judge0.conf"

echo "Infrastructure configuration is ready: $ENV_FILE"
