#!/usr/bin/env bash
# =====================================================================
#  BACKUP — Hub Platform database (run BEFORE the wipe script)
# ---------------------------------------------------------------------
#  Creates a compressed custom-format dump (.dump) that restore.sh can
#  replay. Reads connection settings from ../.env (PG_* vars) unless
#  they are already set in the environment.
#
#  Usage:   ./backup.sh                # timestamped file in ./backups/
#           ./backup.sh my_label       # custom label in the filename
# =====================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../../.env}"

# ── Load PG_* vars from .env if present (does not overwrite existing env) ──
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^PG_ ]] || continue
    val="${val%$'\r'}"                       # strip trailing CR (Windows)
    val="${val%\"}"; val="${val#\"}"          # strip surrounding quotes
    [[ -z "${!key:-}" ]] && export "$key=$val"
  done < <(grep -E '^PG_' "$ENV_FILE")
fi

PGHOST="${PG_HOST:-localhost}"
PGPORT="${PG_PORT:-5432}"
PGDATABASE="${PG_DATABASE:?PG_DATABASE not set (check .env)}"
PGUSER="${PG_USER:?PG_USER not set (check .env)}"
export PGPASSWORD="${PG_PASSWORD:-}"

LABEL="${1:-}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="$SCRIPT_DIR/backups"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/${PGDATABASE}_${LABEL:+${LABEL}_}${STAMP}.dump"

echo "Backing up  $PGDATABASE  on  $PGHOST:$PGPORT  as  $PGUSER"
echo "  ->  $OUT_FILE"

# -Fc = custom compressed format (needed for pg_restore)
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
        -Fc --no-owner --no-privileges -f "$OUT_FILE"

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "Done. Backup size: $SIZE"
echo "Restore with:  ./restore.sh \"$OUT_FILE\""
