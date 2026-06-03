#!/usr/bin/env bash
# JanSeva nightly backup script.
#
# Drops a pg_dump of the JanSeva database into ./backups/, then prunes
# anything older than the most recent 30 dumps. Designed to be run from
# cron on the host:
#
#   0 2 * * *  cd /opt/janseva && ./backup.sh >> /var/log/janseva-backup.log 2>&1
#
# The database container is the one defined in docker-compose.prod.yml,
# so we exec into it via `docker compose`.
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$(dirname "$0")/backups"
COMPOSE_FILE="$(dirname "$0")/docker-compose.prod.yml"

mkdir -p "$BACKUP_DIR"

echo "==> Dumping database to $BACKUP_DIR/backup_$DATE.sql"
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U janseva -d janseva --no-owner --no-acl \
  > "$BACKUP_DIR/backup_$DATE.sql"

# Keep only the most recent 30 dumps.
echo "==> Pruning old backups (keeping last 30)"
ls -1t "$BACKUP_DIR"/backup_*.sql 2>/dev/null \
  | tail -n +31 \
  | xargs -r rm -f

# Quick size sanity check — a zero-byte dump means something broke.
SIZE=$(stat -c%s "$BACKUP_DIR/backup_$DATE.sql" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 1024 ]; then
  echo "WARNING: backup looks suspiciously small ($SIZE bytes)"
  exit 2
fi

echo "Backup complete: $BACKUP_DIR/backup_$DATE.sql ($SIZE bytes)"
