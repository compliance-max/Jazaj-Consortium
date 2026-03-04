#!/bin/sh
set -e

echo "[start-web] Running prisma migrate deploy with retry..."
ATTEMPTS=30
COUNT=1

until npx prisma migrate deploy; do
  if [ "$COUNT" -ge "$ATTEMPTS" ]; then
    echo "[start-web] migrate deploy failed after ${ATTEMPTS} attempts"
    exit 1
  fi
  echo "[start-web] migrate deploy failed (attempt ${COUNT}/${ATTEMPTS}), retrying in 5s..."
  COUNT=$((COUNT + 1))
  sleep 5
done

echo "[start-web] Running bootstrap-admin..."
npm run bootstrap-admin

echo "[start-web] Starting Next.js on 0.0.0.0:${PORT:-3000}"
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
