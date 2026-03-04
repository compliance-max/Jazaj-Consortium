#!/bin/sh
set -e

if [ "${NODE_ENV}" = "production" ]; then
  MISSING_KEYS=""

  if [ "${APP_URL}" != "https://jazaj.com" ]; then
    MISSING_KEYS="${MISSING_KEYS},APP_URL"
  fi

  if [ "${NEXTAUTH_URL}" != "https://jazaj.com" ]; then
    MISSING_KEYS="${MISSING_KEYS},NEXTAUTH_URL"
  fi

  if [ -z "${NEXTAUTH_SECRET}" ]; then
    MISSING_KEYS="${MISSING_KEYS},NEXTAUTH_SECRET"
  elif [ ${#NEXTAUTH_SECRET} -lt 32 ]; then
    MISSING_KEYS="${MISSING_KEYS},NEXTAUTH_SECRET"
  fi

  if [ -z "${DATABASE_URL}" ]; then
    MISSING_KEYS="${MISSING_KEYS},DATABASE_URL"
  fi

  if [ -n "${AUTH_SECRET}" ] && [ -n "${NEXTAUTH_SECRET}" ] && [ "${AUTH_SECRET}" != "${NEXTAUTH_SECRET}" ]; then
    MISSING_KEYS="${MISSING_KEYS},AUTH_SECRET"
  fi

  if [ -n "${MISSING_KEYS}" ]; then
    echo "ENV_MISSING:${MISSING_KEYS#,}"
    exit 1
  fi
fi

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
