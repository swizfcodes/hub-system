# =====================================================================
#  RESTORE — Hub Platform database (Windows / PowerShell)
#  Run if the wipe goes wrong. Needs pg_restore/psql on PATH.
#
#  Usage:   .\restore.ps1 -DumpFile .\backups\mydb_20260713_120000.dump
#           .\restore.ps1 -DumpFile .\backups\....dump -Fresh   # recreate DB
#
#  WARNING: This OVERWRITES current data. Pick the right dump.
# =====================================================================
param(
  [Parameter(Mandatory = $true)][string]$DumpFile,
  [switch]$Fresh
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile   = Join-Path $ScriptDir "..\..\.env"

if (-not (Test-Path $DumpFile)) { throw "Dump not found: $DumpFile" }

# ── Load PG_* vars from .env ──
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | Where-Object { $_ -match '^\s*PG_' } | ForEach-Object {
    $k, $v = $_ -split '=', 2
    $k = $k.Trim(); $v = $v.Trim().Trim('"')
    if (-not [Environment]::GetEnvironmentVariable($k)) {
      [Environment]::SetEnvironmentVariable($k, $v)
    }
  }
}

$PGHOST = if ($env:PG_HOST) { $env:PG_HOST } else { "localhost" }
$PGPORT = if ($env:PG_PORT) { $env:PG_PORT } else { "5432" }
$PGDB   = $env:PG_DATABASE; if (-not $PGDB)  { throw "PG_DATABASE not set (check .env)" }
$PGUSER = $env:PG_USER;     if (-not $PGUSER){ throw "PG_USER not set (check .env)" }
$env:PGPASSWORD = $env:PG_PASSWORD

$Mode = if ($Fresh) { "--fresh" } else { "in-place" }
Write-Host "About to restore $DumpFile"
Write-Host "  into $PGDB on ${PGHOST}:${PGPORT} as $PGUSER   (mode: $Mode)"
$confirm = Read-Host "Type YES to continue"
if ($confirm -ne "YES") { Write-Host "Aborted."; exit 1 }

if ($Fresh) {
  Write-Host "Recreating database $PGDB ..."
  psql -h $PGHOST -p $PGPORT -U $PGUSER -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS `"$PGDB`";"
  psql -h $PGHOST -p $PGPORT -U $PGUSER -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$PGDB`";"
  pg_restore -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDB --no-owner --no-privileges $DumpFile
} else {
  # --clean --if-exists drops each object before recreating; ignore benign
  # "does not exist" errors on a partially-wiped DB.
  pg_restore -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDB --clean --if-exists --no-owner --no-privileges $DumpFile
}

Write-Host "Restore complete."
