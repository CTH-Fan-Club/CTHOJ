#!/usr/bin/env bash
set -o pipefail

./scripts/workers 2>&1 | sed -u -E \
  's/^declare -x (AUTHN_TOKEN|AUTHZ_TOKEN|POSTGRES_PASSWORD|REDIS_PASSWORD|SECRET_KEY_BASE)=.*/declare -x \1="[REDACTED]"/'
