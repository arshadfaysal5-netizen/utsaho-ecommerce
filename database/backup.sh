#!/bin/bash
# Daily database backup for Utsaho
# Usage: ./backup.sh   (or via cron)
# Example cron (daily 3am):  0 3 * * * /mnt/e/Utsaho/database/backup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/../backups"
mkdir -p "$BACKUP_DIR"

DATE="$(date +%Y-%m-%d_%H-%M)"
OUT="$BACKUP_DIR/utsaho_$DATE.sql"

PGPASSWORD="${PGPASSWORD:-utsaho123}" pg_dump -h localhost -U utsaho -d utsaho --clean --if-exists -F c -f "$OUT"

# Keep only the last 30 backups
ls -1t "$BACKUP_DIR"/utsaho_*.sql 2>/dev/null | tail -n +31 | xargs -r rm -f

echo "Backup saved: $OUT"
echo "Total backups kept: $(ls -1 "$BACKUP_DIR"/utsaho_*.sql 2>/dev/null | wc -l)"