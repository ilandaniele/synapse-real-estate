#!/bin/sh
# Runs backup.sh now and then every BACKUP_INTERVAL_HOURS hours. A failed run is logged and retried next interval.
set -u
INTERVAL_SECONDS=$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))
while true; do
  /backup/backup.sh || echo "backup failed; next attempt in ${BACKUP_INTERVAL_HOURS:-24} h" >&2
  sleep "$INTERVAL_SECONDS"
done
