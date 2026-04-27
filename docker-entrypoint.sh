#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."
while ! nc -z db 5432 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready."

echo "Running migrations..."
npx prisma migrate deploy

echo "Starting Obelisk..."
exec npx tsx server/index.ts
