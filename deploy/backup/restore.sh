#!/bin/sh
# Restores a backup over DATABASE_URL and, when given, the storage tarball over STORAGE_DIR.
# It replaces existing data: stop the API and workers first.
# Usage: restore.sh <db-YYYYMMDDTHHMMSSZ.dump> [storage-YYYYMMDDTHHMMSSZ.tar.gz]
set -eu

: "${DATABASE_URL:?DATABASE_URL must point to Postgres}"
DUMP="${1:?usage: restore.sh <db dump> [storage tarball]}"
ARCHIVE="${2:-}"
STORAGE_DIR="${STORAGE_DIR:-/storage}"

[ -f "$DUMP" ] || { echo "no such dump: $DUMP" >&2; exit 1; }
[ -z "$ARCHIVE" ] || [ -f "$ARCHIVE" ] || { echo "no such archive: $ARCHIVE" >&2; exit 1; }

pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$DATABASE_URL" "$DUMP"

if [ -n "$ARCHIVE" ]; then
  mkdir -p "$STORAGE_DIR"
  tar -xzf "$ARCHIVE" -C "$STORAGE_DIR"
fi
echo "restored $DUMP${ARCHIVE:+ and $ARCHIVE}"
