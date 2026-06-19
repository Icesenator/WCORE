#!/bin/sh
set -euo pipefail

SCHEMA="./prisma/schema.prisma"
LOG_FILE="/tmp/prisma-migrate.log"

# pipefail (already set via -o pipefail above) ensures that if prisma migrate
# deploy fails, the pipeline fails even though tee always succeeds. Without
# pipefail, the script would start the server without applying migrations,
# causing data loss and preventing _prisma_migrations from ever being created.
if npx prisma migrate deploy --schema "$SCHEMA" 2>&1 | tee "$LOG_FILE"; then
  echo "[startup] prisma migrate deploy succeeded"
  exec node dist/server.js
fi

echo "[startup] prisma migrate deploy failed (exit $?). Checking for P3005..."
if ! grep -q "P3005" "$LOG_FILE"; then
  echo "[startup] FATAL: prisma migrate deploy failed with non-P3005 error. Refusing to start to prevent data loss."
  cat "$LOG_FILE"
  exit 1
fi

if [ "${ALLOW_PRISMA_BASELINE:-}" != "1" ]; then
  echo "[startup] FATAL: P3005 detected but ALLOW_PRISMA_BASELINE is not set to 1. Refusing to baseline migrations without explicit opt-in."
  exit 1
fi

echo "[startup] P3005 detected — baselining existing migrations on non-empty database."
for dir in ./prisma/migrations/*; do
  if [ -d "$dir" ]; then
    migration="$(basename "$dir")"
    echo "[startup]   resolving $migration as applied"
    npx prisma migrate resolve --schema "$SCHEMA" --applied "$migration"
  fi
done

echo "[startup] retrying prisma migrate deploy after baseline..."
npx prisma migrate deploy --schema "$SCHEMA"
echo "[startup] prisma migrate deploy succeeded after baseline"
exec node dist/server.js
