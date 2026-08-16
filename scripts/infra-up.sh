#!/usr/bin/env bash
set -euo pipefail

ROLE="${1:-all}"
[[ "$ROLE" =~ ^(main|judge|all)$ ]] || { echo "Usage: $0 [main|judge|all]" >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT/scripts/infra-init.sh"
ENV_FILE="$ROOT/infra/.env.infrastructure"

docker compose --project-name cthoj-infrastructure --env-file "$ENV_FILE" --file "$ROOT/infra/docker-compose.yml" --profile "$ROLE" pull --ignore-buildable
if [[ "$ROLE" == "judge" || "$ROLE" == "all" ]]; then
  docker compose --project-name cthoj-infrastructure --env-file "$ENV_FILE" --file "$ROOT/infra/docker-compose.yml" --profile "$ROLE" build judge0-server
fi
docker compose --project-name cthoj-infrastructure --env-file "$ENV_FILE" --file "$ROOT/infra/docker-compose.yml" --profile "$ROLE" up -d --wait --wait-timeout 600

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ "$ROLE" == "main" || "$ROLE" == "all" ]]; then
  docker exec cthoj-postgres pg_isready -U "$CTHOJ_POSTGRES_USER" -d "$CTHOJ_POSTGRES_DB"
  docker exec cthoj-redis redis-cli --no-auth-warning -a "$CTHOJ_REDIS_PASSWORD" ping | grep -q PONG
fi
if [[ "$ROLE" == "judge" || "$ROLE" == "all" ]]; then
  curl --fail --silent --show-error --header "$JUDGE0_AUTH_HEADER: $JUDGE0_AUTH_TOKEN" "http://127.0.0.1:$JUDGE0_PORT/about" >/dev/null
fi

echo "CTHOJ infrastructure role '$ROLE' is ready."
