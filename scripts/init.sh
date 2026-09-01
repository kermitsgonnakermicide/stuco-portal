#!/bin/bash
# scripts/init.sh
# Run database migrations and seed the database on first startup.
# This script is intended to be run inside the container after the app starts.

set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding database..."
npx tsx prisma/seed.ts

echo "Initialization complete."