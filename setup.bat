@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

:: ============================================================
::  ORIKA HUB — VPS + CI/CD SETUP SCRIPT
::  Prepared by JBS Praxis — Elisha Oseudo
::  Covers: Ubuntu 22.04 LTS (Production + Staging)
::  Run from your LOCAL Windows machine
:: ============================================================

title Orika Hub — VPS Setup

:: ────────────────────────────────────────────────────────────
::  COLOUR HELPERS  (uses ANSI via chcp 65001)
:: ────────────────────────────────────────────────────────────
set "ESC="
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "RESET=%ESC%[0m"
set "BOLD=%ESC%[1m"
set "RED=%ESC%[91m"
set "GRN=%ESC%[92m"
set "YEL=%ESC%[93m"
set "CYN=%ESC%[96m"
set "BLU=%ESC%[94m"

goto :MAIN


:: ════════════════════════════════════════════════════════════
::  HELPER SUBROUTINES
:: ════════════════════════════════════════════════════════════

:header
echo.
echo %BOLD%%CYN%══════════════════════════════════════════════════════%RESET%
echo %BOLD%%CYN%  %~1%RESET%
echo %BOLD%%CYN%══════════════════════════════════════════════════════%RESET%
echo.
goto :eof

:info
echo   %BLU%[INFO]%RESET%  %~1
goto :eof

:ok
echo   %GRN%[ OK ]%RESET%  %~1
goto :eof

:warn
echo   %YEL%[WARN]%RESET%  %~1
goto :eof

:err
echo   %RED%[FAIL]%RESET%  %~1
goto :eof

:ask
set "%~1="
set /p "%~1=%BOLD%%~2%RESET% "
goto :eof

:ask_secret
set "%~1="
:: PowerShell masked input
for /f "delims=" %%p in ('powershell -command "$s=Read-Host -AsSecureString '%~2'; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"') do set "%~1=%%p"
goto :eof

:check_ssh
where ssh >nul 2>&1
if errorlevel 1 (
    call :err "ssh not found. Install OpenSSH or Git for Windows."
    pause & exit /b 1
)
goto :eof

:check_scp
where scp >nul 2>&1
if errorlevel 1 (
    call :warn "scp not found — file upload step will be skipped."
)
goto :eof

:check_gh
where gh >nul 2>&1
if errorlevel 1 (
    call :warn "GitHub CLI (gh) not found. GitHub secrets must be set manually."
    set GH_AVAILABLE=0
) else (
    set GH_AVAILABLE=1
)
goto :eof

:pause_step
echo.
echo %YEL%  Press any key to continue to the next step ...%RESET%
pause >nul
goto :eof


:: ════════════════════════════════════════════════════════════
::  MAIN ENTRY POINT
:: ════════════════════════════════════════════════════════════

:MAIN
cls
echo.
echo %BOLD%%CYN%  ╔══════════════════════════════════════════════╗%RESET%
echo %BOLD%%CYN%  ║      ORIKA HUB — VPS DEPLOYMENT SETUP       ║%RESET%
echo %BOLD%%CYN%  ║        JBS Praxis  •  May 2026               ║%RESET%
echo %BOLD%%CYN%  ╚══════════════════════════════════════════════╝%RESET%
echo.
call :info "This script will guide you through:"
echo         %BLU%1.%RESET% Collecting all server + project config values
echo         %BLU%2.%RESET% Generating SSH deploy key pair
echo         %BLU%3.%RESET% Configuring Production VPS  (Ubuntu 22.04)
echo         %BLU%4.%RESET% Configuring Staging VPS     (Ubuntu 22.04)
echo         %BLU%5.%RESET% Creating CI/CD GitHub Actions workflow files
echo         %BLU%6.%RESET% Pushing GitHub Secrets via gh CLI (if available)
echo         %BLU%7.%RESET% Writing per-server remote setup scripts
echo.
call :warn "You need: SSH access to both servers, GitHub repo URL, domain names."
echo.
call :ask PROCEED "Ready to begin? (Y/N)"
if /i not "%PROCEED%"=="Y" (
    call :info "Aborted."
    pause & exit /b 0
)

call :check_ssh
call :check_scp
call :check_gh


:: ════════════════════════════════════════════════════════════
::  STEP 1 — COLLECT CONFIGURATION
:: ════════════════════════════════════════════════════════════
call :header "STEP 1 — CONFIGURATION"

call :info "Enter your server and project details."
echo         (Leave staging IP blank to skip staging setup)
echo.

call :ask PROD_IP       "Production server IP:"
call :ask STAGING_IP    "Staging server IP (or ENTER to skip):"
call :ask DEPLOY_USER   "Deploy username on servers [deploy]:"
if "%DEPLOY_USER%"=="" set DEPLOY_USER=deploy

call :ask PROD_DOMAIN   "Production API domain  (e.g. api.yourdomain.com):"
call :ask STAGING_DOMAIN "Staging API domain    (e.g. staging-api.yourdomain.com):"

call :ask GITHUB_REPO   "GitHub repo URL (https://github.com/ORG/REPO):"
call :ask APP_DIR       "App directory on server [/var/www/hub-system]:"
if "%APP_DIR%"=="" set APP_DIR=/var/www/hub-system

call :ask DB_NAME       "PostgreSQL database name [hub_db]:"
if "%DB_NAME%"=="" set DB_NAME=hub_db

call :ask DB_USER       "PostgreSQL app role name [hub_app]:"
if "%DB_USER%"=="" set DB_USER=hub_app

call :ask_secret DB_PASS   "PostgreSQL app role password:"
call :ask_secret DB_PASS_STAGING "PostgreSQL STAGING role password (different):"
call :ask_secret REDIS_PASS "Redis password:"

:: Generate JWT secrets via PowerShell
call :info "Generating JWT secrets..."
for /f %%s in ('powershell -command "[System.Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64))"') do set JWT_SECRET=%%s
for /f %%s in ('powershell -command "[System.Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64))"') do set JWT_REFRESH=%%s
call :ok "JWT secrets generated."

call :ask SLACK_WEBHOOK "Slack webhook URL for deploy notifications (or ENTER to skip):"

echo.
call :ok "Configuration collected."
call :pause_step


:: ════════════════════════════════════════════════════════════
::  STEP 2 — GENERATE SSH DEPLOY KEY
:: ════════════════════════════════════════════════════════════
call :header "STEP 2 — SSH DEPLOY KEY"

set KEY_FILE=%USERPROFILE%\.ssh\hub_deploy_key

if exist "%KEY_FILE%" (
    call :warn "Deploy key already exists at %KEY_FILE%"
    call :ask REGEN "Regenerate it? (Y/N) [N]:"
    if /i "%REGEN%"=="Y" (
        del /f "%KEY_FILE%" >nul 2>&1
        del /f "%KEY_FILE%.pub" >nul 2>&1
    )
)

if not exist "%KEY_FILE%" (
    call :info "Generating ED25519 deploy key..."
    ssh-keygen -t ed25519 -C "orika-hub-github-deploy" -f "%KEY_FILE%" -N ""
    if errorlevel 1 (
        call :err "Key generation failed."
        pause & exit /b 1
    )
    call :ok "Key pair created:"
    echo             Private: %KEY_FILE%
    echo             Public:  %KEY_FILE%.pub
) else (
    call :ok "Using existing key at %KEY_FILE%"
)

:: Read public key into variable
set /p PUB_KEY=<"%KEY_FILE%.pub"

echo.
call :info "PUBLIC KEY (add this to each server's authorized_keys):"
echo.
echo   %YEL%%PUB_KEY%%RESET%
echo.

:: Offer to push public key to production
call :ask PUSH_PROD_KEY "Push public key to PRODUCTION server now? (Y/N)"
if /i "%PUSH_PROD_KEY%"=="Y" (
    call :info "Pushing to %PROD_IP% ..."
    ssh -o StrictHostKeyChecking=accept-new root@%PROD_IP% "mkdir -p /home/%DEPLOY_USER%/.ssh && echo '%PUB_KEY%' >> /home/%DEPLOY_USER%/.ssh/authorized_keys && chown -R %DEPLOY_USER%:%DEPLOY_USER% /home/%DEPLOY_USER%/.ssh && chmod 700 /home/%DEPLOY_USER%/.ssh && chmod 600 /home/%DEPLOY_USER%/.ssh/authorized_keys"
    if errorlevel 1 (call :warn "Could not push key — add it manually.") else (call :ok "Key added to production server.")
)

if not "%STAGING_IP%"=="" (
    call :ask PUSH_STAGE_KEY "Push public key to STAGING server now? (Y/N)"
    if /i "%PUSH_STAGE_KEY%"=="Y" (
        call :info "Pushing to %STAGING_IP% ..."
        ssh -o StrictHostKeyChecking=accept-new root@%STAGING_IP% "mkdir -p /home/%DEPLOY_USER%/.ssh && echo '%PUB_KEY%' >> /home/%DEPLOY_USER%/.ssh/authorized_keys && chown -R %DEPLOY_USER%:%DEPLOY_USER% /home/%DEPLOY_USER%/.ssh && chmod 700 /home/%DEPLOY_USER%/.ssh && chmod 600 /home/%DEPLOY_USER%/.ssh/authorized_keys"
        if errorlevel 1 (call :warn "Could not push key — add it manually.") else (call :ok "Key added to staging server.")
    )
)

call :pause_step


:: ════════════════════════════════════════════════════════════
::  STEP 3 — WRITE REMOTE SERVER SETUP SCRIPTS
:: ════════════════════════════════════════════════════════════
call :header "STEP 3 — GENERATING SERVER SETUP SCRIPTS"

if not exist "orika-setup" mkdir orika-setup

:: ─── Production server script ────────────────────────────────
call :info "Writing orika-setup\setup-production.sh ..."
(
echo #!/usr/bin/env bash
echo # ============================================================
echo #  Orika Hub — PRODUCTION Server Setup
echo #  Ubuntu 22.04 LTS  ^|  Run as root
echo #  Generated by setup.bat — JBS Praxis
echo # ============================================================
echo set -euo pipefail
echo.
echo PROD_DOMAIN="%PROD_DOMAIN%"
echo APP_DIR="%APP_DIR%"
echo DB_NAME="%DB_NAME%"
echo DB_USER="%DB_USER%"
echo DB_PASS="%DB_PASS%"
echo REDIS_PASS="%REDIS_PASS%"
echo DEPLOY_USER="%DEPLOY_USER%"
echo GITHUB_REPO="%GITHUB_REPO%"
echo.
echo echo "━━━ [1/10] System update ━━━"
echo apt update ^&^& apt upgrade -y
echo apt install -y curl wget git unzip build-essential software-properties-common
echo.
echo echo "━━━ [2/10] Deploy user ━━━"
echo id -u "$DEPLOY_USER" ^>^/dev^/null 2^>^&1 ^|^| adduser --disabled-password --gecos "" "$DEPLOY_USER"
echo usermod -aG sudo "$DEPLOY_USER"
echo.
echo echo "━━━ [3/10] Harden SSH ━━━"
echo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
echo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
echo sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
echo systemctl restart sshd
echo.
echo echo "━━━ [4/10] Firewall (UFW) ━━━"
echo ufw --force reset
echo ufw default deny incoming
echo ufw default allow outgoing
echo ufw allow ssh
echo ufw allow http
echo ufw allow https
echo ufw --force enable
echo ufw status verbose
echo.
echo echo "━━━ [5/10] Timezone + locale ━━━"
echo timedatectl set-timezone Africa/Lagos
echo locale-gen en_GB.UTF-8
echo update-locale LANG=en_GB.UTF-8
echo.
echo echo "━━━ [6/10] Node.js 20 LTS + PM2 ━━━"
echo curl -fsSL https://deb.nodesource.com/setup_20.x ^| bash -
echo apt install -y nodejs
echo npm install -g pm2
echo node --version
echo pm2 --version
echo.
echo echo "━━━ [7/10] PostgreSQL 16 ━━━"
echo sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" ^> /etc/apt/sources.list.d/pgdg.list'
echo wget -qO - https://www.postgresql.org/media/keys/ACCC4CF8.asc ^| apt-key add -
echo apt update ^&^& apt install -y postgresql-16
echo systemctl enable --now postgresql
echo sudo -i -u postgres psql -c "CREATE DATABASE $DB_NAME;" 2^>^/dev^/null ^|^| true
echo sudo -i -u postgres psql -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';" 2^>^/dev^/null ^|^| true
echo sudo -i -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
echo # Tune postgresql.conf
echo sed -i "s/^#*listen_addresses.*/listen_addresses = 'localhost'/" /etc/postgresql/16/main/postgresql.conf
echo sed -i "s/^#*max_connections.*/max_connections = 100/"           /etc/postgresql/16/main/postgresql.conf
echo sed -i "s/^#*shared_buffers.*/shared_buffers = 256MB/"           /etc/postgresql/16/main/postgresql.conf
echo sed -i "s/^#*work_mem.*/work_mem = 4MB/"                         /etc/postgresql/16/main/postgresql.conf
echo sed -i "s/^#*log_timezone.*/log_timezone = 'Africa\/Lagos'/"     /etc/postgresql/16/main/postgresql.conf
echo systemctl restart postgresql
echo.
echo echo "━━━ [8/10] Redis ━━━"
echo apt install -y redis-server
echo sed -i "s/^supervised no/supervised systemd/"                 /etc/redis/redis.conf
echo sed -i "s/^# bind 127.0.0.1/bind 127.0.0.1/"                /etc/redis/redis.conf
echo sed -i "s/^# requirepass.*/requirepass $REDIS_PASS/"         /etc/redis/redis.conf
echo sed -i "s/^# maxmemory .*/maxmemory 512mb/"                  /etc/redis/redis.conf
echo sed -i "s/^# maxmemory-policy.*/maxmemory-policy allkeys-lru/" /etc/redis/redis.conf
echo systemctl enable --now redis-server
echo redis-cli -a "$REDIS_PASS" ping
echo.
echo echo "━━━ [9/10] Nginx + SSL ━━━"
echo apt install -y nginx certbot python3-certbot-nginx
echo cat ^> /etc/nginx/sites-available/hub-api ^<^< 'NGINXEOF'
echo server {
echo     listen 80;
echo     server_name %PROD_DOMAIN%;
echo     return 301 https://$server_name$request_uri;
echo }
echo server {
echo     listen 443 ssl http2;
echo     server_name %PROD_DOMAIN%;
echo     ssl_certificate     /etc/letsencrypt/live/%PROD_DOMAIN%/fullchain.pem;
echo     ssl_certificate_key /etc/letsencrypt/live/%PROD_DOMAIN%/privkey.pem;
echo     ssl_protocols TLSv1.2 TLSv1.3;
echo     ssl_prefer_server_ciphers off;
echo     add_header X-Frame-Options "SAMEORIGIN" always;
echo     add_header X-Content-Type-Options "nosniff" always;
echo     add_header Strict-Transport-Security "max-age=31536000" always;
echo     client_max_body_size 20M;
echo     location / {
echo         proxy_pass http://127.0.0.1:3000;
echo         proxy_http_version 1.1;
echo         proxy_set_header Upgrade $http_upgrade;
echo         proxy_set_header Connection "upgrade";
echo         proxy_set_header Host $host;
echo         proxy_set_header X-Real-IP $remote_addr;
echo         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
echo         proxy_set_header X-Forwarded-Proto $scheme;
echo         proxy_read_timeout 120s;
echo         proxy_send_timeout 120s;
echo     }
echo }
echo NGINXEOF
echo ln -sf /etc/nginx/sites-available/hub-api /etc/nginx/sites-enabled/
echo rm -f /etc/nginx/sites-enabled/default
echo nginx -t
echo systemctl reload nginx
echo certbot --nginx -d %PROD_DOMAIN% --non-interactive --agree-tos -m admin@%PROD_DOMAIN% ^|^| echo "WARN: certbot failed — run manually after DNS propagates"
echo.
echo echo "━━━ [10/10] App directories + env file ━━━"
echo mkdir -p "$APP_DIR" /var/www/hub-uploads /var/log/hub
echo chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR" /var/www/hub-uploads /var/log/hub
echo # Clone repo
echo sudo -u "$DEPLOY_USER" bash -c "cd /var/www ^&^& git clone $GITHUB_REPO hub-system 2^>^/dev^/null ^|^| (cd hub-system ^&^& git pull origin main)"
echo sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR ^&^& npm install --omit=dev"
echo # Write env file
echo cat ^> "$APP_DIR/.env.production" ^<^< ENVEOF
echo NODE_ENV=production
echo PORT=3000
echo PG_HOST=localhost
echo PG_DATABASE=$DB_NAME
echo PG_USER=$DB_USER
echo PG_PASSWORD=$DB_PASS
echo REDIS_URL=redis://:$REDIS_PASS@127.0.0.1:6379
echo JWT_SECRET=%JWT_SECRET%
echo JWT_REFRESH_SECRET=%JWT_REFRESH%
echo ENVEOF
echo chmod 600 "$APP_DIR/.env.production"
echo # Run migrations
echo sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR ^&^& NODE_ENV=production node scripts/migrate.js run"
echo # PM2 ecosystem config
echo cat ^> "$APP_DIR/ecosystem.config.js" ^<^< 'PM2EOF'
echo module.exports = { apps: [{ name: 'hub-api', script: 'server.js', cwd: '/var/www/hub-system', instances: 2, exec_mode: 'cluster', env_production: { NODE_ENV: 'production' }, error_file: '/var/log/hub/error.log', out_file: '/var/log/hub/out.log', log_date_format: 'YYYY-MM-DD HH:mm:ss', max_memory_restart: '1G', restart_delay: 5000, watch: false }] };
echo PM2EOF
echo sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR ^&^& pm2 start ecosystem.config.js --env production ^&^& pm2 save"
echo pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" ^| bash
echo # Backup script
echo cat ^> /usr/local/bin/hub-backup.sh ^<^< 'BKEOF'
echo #!/bin/bash
echo BACKUP_DIR="/var/backups/hub"; DATE=$(date +%%Y%%m%%d_%%H%%M%%S); DB_NAME="%DB_NAME%"; KEEP_DAYS=7
echo mkdir -p $BACKUP_DIR
echo sudo -u postgres pg_dump $DB_NAME ^| gzip ^> "$BACKUP_DIR/hub_db_$DATE.sql.gz"
echo find $BACKUP_DIR -name "*.sql.gz" -mtime +$KEEP_DAYS -delete
echo echo "Backup: hub_db_$DATE.sql.gz"
echo BKEOF
echo chmod +x /usr/local/bin/hub-backup.sh
echo (crontab -l 2^>^/dev^/null; echo "0 2 * * * /usr/local/bin/hub-backup.sh ^>^> /var/log/hub/backup.log 2^>^&1") ^| crontab -
echo.
echo echo ""
echo echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo echo "  Production setup complete!"
echo echo "  Run: curl https://%PROD_DOMAIN%/health"
echo echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
) > "orika-setup\setup-production.sh"
call :ok "orika-setup\setup-production.sh written."


:: ─── Staging server script ───────────────────────────────────
if not "%STAGING_IP%"=="" (
    call :info "Writing orika-setup\setup-staging.sh ..."
    (
    echo #!/usr/bin/env bash
    echo # ============================================================
    echo #  Orika Hub — STAGING Server Setup
    echo #  Ubuntu 22.04 LTS  ^|  Run as root
    echo #  Generated by setup.bat — JBS Praxis
    echo # ============================================================
    echo set -euo pipefail
    echo.
    echo STAGING_DOMAIN="%STAGING_DOMAIN%"
    echo APP_DIR="%APP_DIR%"
    echo DB_NAME="%DB_NAME%"
    echo DB_USER="%DB_USER%"
    echo DB_PASS="%DB_PASS_STAGING%"
    echo REDIS_PASS="%REDIS_PASS%"
    echo DEPLOY_USER="%DEPLOY_USER%"
    echo GITHUB_REPO="%GITHUB_REPO%"
    echo.
    echo echo "Repeating production steps with staging config..."
    echo apt update ^&^& apt upgrade -y
    echo apt install -y curl wget git unzip build-essential software-properties-common nginx certbot python3-certbot-nginx redis-server
    echo # Node.js
    echo curl -fsSL https://deb.nodesource.com/setup_20.x ^| bash - ^&^& apt install -y nodejs
    echo npm install -g pm2
    echo # PostgreSQL
    echo sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" ^> /etc/apt/sources.list.d/pgdg.list'
    echo wget -qO - https://www.postgresql.org/media/keys/ACCC4CF8.asc ^| apt-key add -
    echo apt update ^&^& apt install -y postgresql-16
    echo systemctl enable --now postgresql
    echo sudo -i -u postgres psql -c "CREATE DATABASE $DB_NAME;" 2^>^/dev^/null ^|^| true
    echo sudo -i -u postgres psql -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';" 2^>^/dev^/null ^|^| true
    echo sudo -i -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
    echo systemctl restart postgresql
    echo # Redis
    echo sed -i "s/^supervised no/supervised systemd/" /etc/redis/redis.conf
    echo sed -i "s/^# requirepass.*/requirepass $REDIS_PASS/" /etc/redis/redis.conf
    echo systemctl enable --now redis-server
    echo # Nginx + SSL
    echo cat ^> /etc/nginx/sites-available/hub-api ^<^< 'NGINXEOF'
    echo server { listen 80; server_name %STAGING_DOMAIN%; return 301 https://$server_name$request_uri; }
    echo server { listen 443 ssl http2; server_name %STAGING_DOMAIN%; ssl_certificate /etc/letsencrypt/live/%STAGING_DOMAIN%/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/%STAGING_DOMAIN%/privkey.pem; ssl_protocols TLSv1.2 TLSv1.3; client_max_body_size 20M; location / { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_read_timeout 120s; } }
    echo NGINXEOF
    echo ln -sf /etc/nginx/sites-available/hub-api /etc/nginx/sites-enabled/
    echo rm -f /etc/nginx/sites-enabled/default
    echo nginx -t ^&^& systemctl reload nginx
    echo certbot --nginx -d %STAGING_DOMAIN% --non-interactive --agree-tos -m admin@%STAGING_DOMAIN% ^|^| echo "WARN: run certbot manually"
    echo # App
    echo id -u "$DEPLOY_USER" ^>^/dev^/null 2^>^&1 ^|^| adduser --disabled-password --gecos "" "$DEPLOY_USER"
    echo usermod -aG sudo "$DEPLOY_USER"
    echo mkdir -p "$APP_DIR" /var/www/hub-uploads /var/log/hub
    echo chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR" /var/www/hub-uploads /var/log/hub
    echo sudo -u "$DEPLOY_USER" bash -c "cd /var/www ^&^& git clone $GITHUB_REPO hub-system 2^>^/dev^/null ^|^| (cd hub-system ^&^& git pull origin staging)"
    echo sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR ^&^& npm install --omit=dev"
    echo cat ^> "$APP_DIR/.env.staging" ^<^< ENVEOF
    echo NODE_ENV=staging
    echo PORT=3000
    echo PG_HOST=localhost
    echo PG_DATABASE=$DB_NAME
    echo PG_USER=$DB_USER
    echo PG_PASSWORD=$DB_PASS
    echo REDIS_URL=redis://:$REDIS_PASS@127.0.0.1:6379
    echo JWT_SECRET=%JWT_SECRET%
    echo JWT_REFRESH_SECRET=%JWT_REFRESH%
    echo ENVEOF
    echo chmod 600 "$APP_DIR/.env.staging"
    echo sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR ^&^& NODE_ENV=staging node scripts/migrate.js run"
    echo cat ^> "$APP_DIR/ecosystem.config.js" ^<^< 'PM2EOF'
    echo module.exports = { apps: [{ name: 'hub-api-staging', script: 'server.js', cwd: '/var/www/hub-system', instances: 1, exec_mode: 'fork', env_staging: { NODE_ENV: 'staging' }, error_file: '/var/log/hub/error.log', out_file: '/var/log/hub/out.log', max_memory_restart: '512M', watch: false }] };
    echo PM2EOF
    echo sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR ^&^& pm2 start ecosystem.config.js --env staging ^&^& pm2 save"
    echo pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" ^| bash
    echo echo "Staging setup complete. Test: curl https://%STAGING_DOMAIN%/health"
    ) > "orika-setup\setup-staging.sh"
    call :ok "orika-setup\setup-staging.sh written."
)

call :pause_step


:: ════════════════════════════════════════════════════════════
::  STEP 4 — GITHUB ACTIONS CI/CD WORKFLOW FILES
:: ════════════════════════════════════════════════════════════
call :header "STEP 4 — CI/CD WORKFLOW FILES"

if not exist "orika-setup\.github\workflows" mkdir "orika-setup\.github\workflows"

:: ─── deploy-production.yml ───────────────────────────────────
call :info "Writing deploy-production.yml ..."
(
echo name: Deploy ^-^- Production
echo.
echo on:
echo   push:
echo     branches: ^[main^]
echo.
echo jobs:
echo   test:
echo     name: Run tests
echo     runs-on: ubuntu-latest
echo     steps:
echo       - uses: actions/checkout@v4
echo       - uses: actions/setup-node@v4
echo         with:
echo           node-version: '20'
echo           cache: 'npm'
echo       - run: npm ci
echo       - run: npm test --if-present
echo.
echo   deploy:
echo     name: Deploy to Production VPS
echo     runs-on: ubuntu-latest
echo     needs: test
echo     environment: production
echo.
echo     steps:
echo       - name: Deploy via SSH
echo         uses: appleboy/ssh-action@v1.0.3
echo         with:
echo           host: ${{ secrets.PROD_SSH_HOST }}
echo           username: ${{ secrets.SSH_USER }}
echo           key: ${{ secrets.SSH_PRIVATE_KEY }}
echo           script: ^|
echo             set -e
echo             cd %APP_DIR%
echo.
echo             echo "^-^-^- Pulling latest code"
echo             git pull origin main
echo.
echo             echo "^-^-^- Installing dependencies"
echo             npm install --omit=dev
echo.
echo             echo "^-^-^- Running migrations"
echo             NODE_ENV=production node scripts/migrate.js run
echo.
echo             echo "^-^-^- Zero-downtime reload"
echo             pm2 reload hub-api
echo.
echo             echo "^-^-^- Health check"
echo             sleep 3
echo             curl -sf https://%PROD_DOMAIN%/health ^|^| ^(echo "Health check FAILED" ^&^& exit 1^)
echo             echo "Production deploy complete"
echo.
if not "%SLACK_WEBHOOK%"=="" (
echo       - name: Notify Slack
echo         if: always^(^)
echo         uses: slackapi/slack-github-action@v1.26.0
echo         with:
echo           payload: '^{"text":"${{ job.status == ^'success^' ^&^& ^'✅^' ^|^| ^'🔴^' }} *Production deploy* ${{ job.status }} — ${{ github.event.head_commit.message }}"}^'
echo         env:
echo           SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
)
) > "orika-setup\.github\workflows\deploy-production.yml"
call :ok "deploy-production.yml written."

:: ─── deploy-staging.yml ──────────────────────────────────────
call :info "Writing deploy-staging.yml ..."
(
echo name: Deploy ^-^- Staging
echo.
echo on:
echo   push:
echo     branches: ^[staging^]
echo   pull_request:
echo     types: ^[closed^]
echo     branches: ^[main^]
echo.
echo jobs:
echo   deploy:
echo     name: Deploy to Staging VPS
echo     runs-on: ubuntu-latest
echo     if: github.event_name == 'push' ^|^| github.event.pull_request.merged == true
echo.
echo     steps:
echo       - name: Deploy via SSH
echo         uses: appleboy/ssh-action@v1.0.3
echo         with:
echo           host: ${{ secrets.STAGING_SSH_HOST }}
echo           username: ${{ secrets.SSH_USER }}
echo           key: ${{ secrets.SSH_PRIVATE_KEY }}
echo           script: ^|
echo             set -e
echo             cd %APP_DIR%
echo.
echo             echo "^-^-^- Pulling latest code"
echo             git pull origin staging ^|^| git pull origin main
echo.
echo             echo "^-^-^- Installing dependencies"
echo             npm install --omit=dev
echo.
echo             echo "^-^-^- Running migrations"
echo             NODE_ENV=staging node scripts/migrate.js run
echo.
echo             echo "^-^-^- Zero-downtime reload"
echo             pm2 reload hub-api-staging
echo.
echo             echo "^-^-^- Health check"
echo             sleep 3
echo             curl -sf https://%STAGING_DOMAIN%/health ^|^| ^(echo "Health check FAILED" ^&^& exit 1^)
echo             echo "Staging deploy complete"
echo.
if not "%SLACK_WEBHOOK%"=="" (
echo       - name: Notify Slack
echo         if: always^(^)
echo         uses: slackapi/slack-github-action@v1.26.0
echo         with:
echo           payload: '^{"text":"${{ job.status == ^'success^' ^&^& ^'🟡^' ^|^| ^'🔴^' }} *Staging deploy* ${{ job.status }} — ${{ github.event.head_commit.message }}"}^'
echo         env:
echo           SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
)
) > "orika-setup\.github\workflows\deploy-staging.yml"
call :ok "deploy-staging.yml written."

call :pause_step


:: ════════════════════════════════════════════════════════════
::  STEP 5 — GITHUB SECRETS
:: ════════════════════════════════════════════════════════════
call :header "STEP 5 — GITHUB SECRETS"

:: Read private key from file
set /p PRIVKEY_LINE1=<"%KEY_FILE%"
call :info "Reading private key from %KEY_FILE%..."

if "%GH_AVAILABLE%"=="1" (
    call :ask SET_SECRETS "Push secrets to GitHub repo now via gh CLI? (Y/N)"
    if /i "!SET_SECRETS!"=="Y" (
        call :info "Authenticating with GitHub..."
        gh auth status >nul 2>&1
        if errorlevel 1 (
            gh auth login
        )
        call :info "Setting secrets on %GITHUB_REPO%..."
        gh secret set PROD_SSH_HOST    --body "%PROD_IP%"       --repo "%GITHUB_REPO%"
        gh secret set STAGING_SSH_HOST --body "%STAGING_IP%"    --repo "%GITHUB_REPO%"
        gh secret set SSH_USER         --body "%DEPLOY_USER%"   --repo "%GITHUB_REPO%"
        gh secret set SSH_PRIVATE_KEY  < "%KEY_FILE%"            --repo "%GITHUB_REPO%"
        if not "%SLACK_WEBHOOK%"=="" (
            gh secret set SLACK_WEBHOOK --body "%SLACK_WEBHOOK%" --repo "%GITHUB_REPO%"
        )
        call :ok "All secrets pushed to GitHub."
    )
) else (
    call :warn "GitHub CLI not available — add secrets manually:"
    echo.
    echo   %YEL%Go to: %GITHUB_REPO%/settings/secrets/actions%RESET%
    echo.
    echo   Add these secrets:
    echo   %BLU%  PROD_SSH_HOST%RESET%     = %PROD_IP%
    echo   %BLU%  STAGING_SSH_HOST%RESET%  = %STAGING_IP%
    echo   %BLU%  SSH_USER%RESET%          = %DEPLOY_USER%
    echo   %BLU%  SSH_PRIVATE_KEY%RESET%   = ^(contents of %KEY_FILE%^)
    if not "%SLACK_WEBHOOK%"=="" (
    echo   %BLU%  SLACK_WEBHOOK%RESET%     = %SLACK_WEBHOOK%
    )
)

call :pause_step


:: ════════════════════════════════════════════════════════════
::  STEP 6 — UPLOAD SERVER SCRIPTS + RUN
:: ════════════════════════════════════════════════════════════
call :header "STEP 6 — UPLOAD AND EXECUTE SERVER SCRIPTS"

call :ask RUN_PROD "Upload and execute setup-production.sh on the production server? (Y/N)"
if /i "%RUN_PROD%"=="Y" (
    call :info "Uploading to %PROD_IP% ..."
    scp "orika-setup\setup-production.sh" "%DEPLOY_USER%@%PROD_IP%:/tmp/setup-production.sh"
    if errorlevel 1 (
        call :err "Upload failed. Copy orika-setup\setup-production.sh manually and run with: sudo bash /tmp/setup-production.sh"
    ) else (
        call :ok "Uploaded. Running on server (this takes ~5 minutes)..."
        ssh "%DEPLOY_USER%@%PROD_IP%" "chmod +x /tmp/setup-production.sh && sudo bash /tmp/setup-production.sh"
        if errorlevel 1 (
            call :err "Script failed — check SSH output above."
        ) else (
            call :ok "Production server setup complete."
        )
    )
)

if not "%STAGING_IP%"=="" (
    call :ask RUN_STAGING "Upload and execute setup-staging.sh on the staging server? (Y/N)"
    if /i "%RUN_STAGING%"=="Y" (
        call :info "Uploading to %STAGING_IP% ..."
        scp "orika-setup\setup-staging.sh" "%DEPLOY_USER%@%STAGING_IP%:/tmp/setup-staging.sh"
        if errorlevel 1 (
            call :err "Upload failed. Run manually."
        ) else (
            call :ok "Uploaded. Running on server..."
            ssh "%DEPLOY_USER%@%STAGING_IP%" "chmod +x /tmp/setup-staging.sh && sudo bash /tmp/setup-staging.sh"
            if errorlevel 1 (
                call :err "Script failed — check SSH output above."
            ) else (
                call :ok "Staging server setup complete."
            )
        )
    )
)

call :pause_step


:: ════════════════════════════════════════════════════════════
::  STEP 7 — COPY WORKFLOW FILES INTO PROJECT
:: ════════════════════════════════════════════════════════════
call :header "STEP 7 — COPY CI/CD FILES INTO YOUR PROJECT"

call :ask PROJ_DIR "Enter your LOCAL project root path (where .git lives), or ENTER to skip:"
if not "%PROJ_DIR%"=="" (
    if not exist "%PROJ_DIR%\.github\workflows" mkdir "%PROJ_DIR%\.github\workflows"
    copy /y "orika-setup\.github\workflows\deploy-production.yml" "%PROJ_DIR%\.github\workflows\deploy-production.yml" >nul
    copy /y "orika-setup\.github\workflows\deploy-staging.yml"    "%PROJ_DIR%\.github\workflows\deploy-staging.yml"    >nul
    call :ok "Workflow files copied to %PROJ_DIR%\.github\workflows\"
    call :info "Commit and push them to activate CI/CD:"
    echo.
    echo   %YEL%  cd "%PROJ_DIR%"%RESET%
    echo   %YEL%  git add .github/workflows/%RESET%
    echo   %YEL%  git commit -m "ci: add GitHub Actions deploy workflows"%RESET%
    echo   %YEL%  git push origin main%RESET%
) else (
    call :info "Skipped. Workflow files are in orika-setup\.github\workflows\"
)

call :pause_step


:: ════════════════════════════════════════════════════════════
::  STEP 8 — WRITE CREDENTIALS REFERENCE FILE
:: ════════════════════════════════════════════════════════════
call :header "STEP 8 — CREDENTIALS REFERENCE"

(
echo # Orika Hub — Generated Credentials Reference
echo # Generated: %DATE% %TIME%
echo # KEEP THIS FILE SECURE — DO NOT COMMIT TO GIT
echo.
echo ## Servers
echo PROD_IP=%PROD_IP%
echo STAGING_IP=%STAGING_IP%
echo DEPLOY_USER=%DEPLOY_USER%
echo SSH_KEY=%KEY_FILE%
echo.
echo ## Domains
echo PROD_DOMAIN=%PROD_DOMAIN%
echo STAGING_DOMAIN=%STAGING_DOMAIN%
echo.
echo ## Database
echo DB_NAME=%DB_NAME%
echo DB_USER=%DB_USER%
echo DB_PASS_PROD=%DB_PASS%
echo DB_PASS_STAGING=%DB_PASS_STAGING%
echo.
echo ## Redis
echo REDIS_PASS=%REDIS_PASS%
echo.
echo ## JWT (auto-generated)
echo JWT_SECRET=%JWT_SECRET%
echo JWT_REFRESH_SECRET=%JWT_REFRESH%
echo.
echo ## GitHub
echo GITHUB_REPO=%GITHUB_REPO%
echo.
echo ## GitHub Secrets to set manually (if gh CLI was skipped)
echo #  PROD_SSH_HOST     = %PROD_IP%
echo #  STAGING_SSH_HOST  = %STAGING_IP%
echo #  SSH_USER          = %DEPLOY_USER%
echo #  SSH_PRIVATE_KEY   = contents of %KEY_FILE%
if not "%SLACK_WEBHOOK%"=="" (
echo #  SLACK_WEBHOOK     = %SLACK_WEBHOOK%
)
) > "orika-setup\credentials.env"

call :warn "Credentials saved to orika-setup\credentials.env — keep this file PRIVATE."

:: ════════════════════════════════════════════════════════════
::  DONE
:: ════════════════════════════════════════════════════════════
echo.
echo %BOLD%%GRN%  ╔══════════════════════════════════════════════╗%RESET%
echo %BOLD%%GRN%  ║           ALL STEPS COMPLETE ✓               ║%RESET%
echo %BOLD%%GRN%  ╚══════════════════════════════════════════════╝%RESET%
echo.
echo   Files created in %CYN%orika-setup\%RESET%:
echo.
echo   %BLU%  setup-production.sh%RESET%               — run on prod VPS as root
echo   %BLU%  setup-staging.sh%RESET%                  — run on staging VPS as root
echo   %BLU%  .github\workflows\deploy-production.yml%RESET% — CI/CD for main branch
echo   %BLU%  .github\workflows\deploy-staging.yml%RESET%    — CI/CD for staging branch
echo   %BLU%  credentials.env%RESET%                   — all generated secrets (keep private!)
echo.
echo   %YEL%Deployment flow after this:%RESET%
echo   1. Push .github\workflows\ into your repo
echo   2. Any merge to main  → auto-deploys to production
echo   3. Any push to staging → auto-deploys to staging
echo.
echo %BOLD%  Good luck — JBS Praxis%RESET%
echo.
pause
endlocal