#!/bin/sh
set -e

echo "[entrypoint] Aplicando migraciones Prisma..."
npx prisma migrate deploy

echo "[entrypoint] Arrancando aplicación..."
exec "$@"
