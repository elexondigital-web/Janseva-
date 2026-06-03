#!/usr/bin/env bash
# JanSeva production deploy script.
#
# Usage:
#   ./deploy.sh                      # pull main, rebuild, migrate, start
#   ./deploy.sh --skip-migrate       # skip Prisma migrate step
#   ./deploy.sh --no-pull            # use already-checked-out code
#
# Environment:
#   .env (sibling of docker-compose.prod.yml) must define DB_PASSWORD,
#   JWT_SECRET, JWT_REFRESH_SECRET, FRONTEND_URL, AWS_*, SMTP_*, etc.
#   See .env.example for the full list.
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
SKIP_MIGRATE=0
SKIP_PULL=0

for arg in "$@"; do
  case "$arg" in
    --skip-migrate) SKIP_MIGRATE=1 ;;
    --no-pull)      SKIP_PULL=1 ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy backend/.env.example to ./.env and fill the values."
  exit 1
fi

if [ "$SKIP_PULL" -eq 0 ]; then
  echo "==> Pulling latest from origin/main"
  git pull --ff-only origin main
fi

echo "==> Building images"
docker compose -f "$COMPOSE_FILE" build

if [ "$SKIP_MIGRATE" -eq 0 ]; then
  echo "==> Running Prisma migrations"
  # Run migrate against the already-running DB so we don't drop traffic.
  # If it's a first-time deploy, bring up the DB first.
  docker compose -f "$COMPOSE_FILE" up -d db
  docker compose -f "$COMPOSE_FILE" run --rm backend npx prisma migrate deploy
fi

echo "==> Starting all services"
docker compose -f "$COMPOSE_FILE" up -d

echo "==> Pruning old image layers"
docker image prune -f >/dev/null

echo
echo "Deployment complete."
echo "Tail backend logs:  docker compose -f $COMPOSE_FILE logs -f backend"
echo "Tail nginx logs:    docker compose -f $COMPOSE_FILE logs -f nginx"
