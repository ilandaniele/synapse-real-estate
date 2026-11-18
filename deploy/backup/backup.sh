#!/bin/sh
# One backup: a pg_dump of DATABASE_URL and, with local storage, a tarball of STORAGE_DIR.
# Old files beyond BACKUP_KEEP_DAYS are removed from BACKUP_DIR.
set -eu

: "${DATABASE_URL:?DATABASE_URL must point to Postgres}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
STORAGE_DIR="${STORAGE_DIR:-/storage}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$BACKUP_DIR/db-$STAMP.dump.partial"
mv "$BACKUP_DIR/db-$STAMP.dump.partial" "$BACKUP_DIR/db-$STAMP.dump"

if [ "${STORAGE_DRIVER:-local}" = "local" ] && [ -d "$STORAGE_DIR" ]; then
  tar -czf "$BACKUP_DIR/storage-$STAMP.tar.gz.partial" -C "$STORAGE_DIR" .
  mv "$BACKUP_DIR/storage-$STAMP.tar.gz.partial" "$BACKUP_DIR/storage-$STAMP.tar.gz"
fi

find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'storage-*.tar.gz' \) -mtime +"$KEEP_DAYS" -exec rm -f {} +
echo "backup $STAMP written to $BACKUP_DIR"
