# =====================================================================
#  BACKUP — Hub Platform database (Windows / PowerShell)
#  Run BEFORE the wipe script. Needs pg_dump on PATH (PostgreSQL bin).
#
#  Usage:   .\backup.ps1                 # timestamped file in .\backups\
#           .\backup.ps1 -Label myLabel  # custom label in filename
# =====================================================================
param([string]$Label = "")

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile   = Join-Path $ScriptDir "..\..\.env"

# ── Load PG_* vars from .env (does not overwrite existing env) ──
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

$Stamp  = Get-Date -Format "yyyyMMdd_HHmmss"
$OutDir = Join-Path $ScriptDir "backups"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Tag    = if ($Label) { "${Label}_" } else { "" }
$OutFile= Join-Path $OutDir "${PGDB}_${Tag}${Stamp}.dump"

Write-Host "Backing up $PGDB on ${PGHOST}:${PGPORT} as $PGUSER"
Write-Host "  -> $OutFile"

pg_dump -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDB -Fc --no-owner --no-privileges -f $OutFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }

$SizeMB = [math]::Round((Get-Item $OutFile).Length / 1MB, 2)
Write-Host "Done. Backup size: $SizeMB MB"
Write-Host "Restore with:  .\restore.ps1 -DumpFile `"$OutFile`""
