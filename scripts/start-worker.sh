#!/bin/sh
set -e

echo "[start-worker] Starting BullMQ worker"
exec npm run worker
