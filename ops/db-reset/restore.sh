#!/usr/bin/env bash
# =====================================================================
#  RESTORE — Hub Platform database (run if the wipe goes wrong)
# ---------------------------------------------------------------------
#  Replays a .dump created by backup.sh back into the database.
#  By default it restores INTO THE EXISTING database, dropping and
#  recreating each object as it goes (--clean --if-exists).
#
#  Usage:   ./restore.sh backups/mydb_20260713_120000.dump
#           ./restore.sh backups/....dump  --fresh   # recreate whole DB
#
#  ⚠ This OVERWRITES current data. Make sure you picked the right dump.
# =====================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../../.env}"

DUMP_FILE="${1:?Usage: ./restore.sh <dumpfile> [--fresh]}"
MODE="${2:-inplace}"
[[ -f "$DUMP_FILE" ]] || { echo "Dump not found: $DUMP_FILE" >&2; exit 1; }

# ── Load PG_* vars from .env if present ──
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^PG_ ]] || continue
    val="${val%$'\r'}"; val="${val%\"}"; val="${val#\"}"
    [[ -z "${!key:-}" ]] && export "$key=$val"
  done < <(grep -E '^PG_' "$ENV_FILE")
fi

PGHOST="${PG_HOST:-localhost}"
PGPORT="${PG_PORT:-5432}"
PGDATABASE="${PG_DATABASE:?PG_DATABASE not set (check .env)}"
PGUSER="${PG_USER:?PG_USER not set (check .env)}"
export PGPASSWORD="${PG_PASSWORD:-}"

echo "About to restore  $DUMP_FILE"
echo "  into  $PGDATABASE  on  $PGHOST:$PGPORT  as  $PGUSER   (mode: $MODE)"
read -r -p "Type YES to continue: " CONFIRM
[[ "$CONFIRM" == "YES" ]] || { echo "Aborted."; exit 1; }

if [[ "$MODE" == "--fresh" ]]; then
  # Drop & recreate the whole database (connect via the 'postgres' db).
  echo "Recreating database $PGDATABASE ..."
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c \
    "DROP DATABASE IF EXISTS \"$PGDATABASE\";"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c \
    "CREATE DATABASE \"$PGDATABASE\";"
  pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
             --no-owner --no-privileges "$DUMP_FILE"
else
  # In-place: clean existing objects then restore. --exit-on-error off so
  # harmless "does not exist" drops on a partial DB don't halt the restore.
  pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
             --clean --if-exists --no-owner --no-privileges "$DUMP_FILE" || true
fi

echo "Restore complete."
