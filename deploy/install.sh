#!/usr/bin/env bash
# =============================================================================
# Life OS — one-command production install
#
#   sudo bash deploy/install.sh
#
# Installs ONLY Life OS (backend + dashboard) into the repo directory:
#   1. npm install (backend, dashboard)
#   2. dashboard production build (Vite; needs the raised heap)
#   3. systemd units (agentos-backend :3004, agentos-dashboard :3002)
#   4. enable --now + health check
#
# Optional components (AI engines, n8n, Coder) are NOT installed here —
# they are installed from the UI: Настройки life os → «Установка компонентов».
# Caddy/ingress is expected to be configured separately (deploy/Caddyfile).
# =============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "==> Life OS directory: $DIR"

command -v node >/dev/null 2>&1 || { echo "✘ node не найден (нужен Node 18+)"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "✘ npm не найден"; exit 1; }
command -v systemctl >/dev/null 2>&1 || { echo "✘ systemd не найден — этот скрипт для прод-сервера с systemd"; exit 1; }

# ---------------------------------------------------------------- backend ----
echo "==> [1/5] backend: npm install"
cd "$DIR/agentos-backend"
npm install --no-audit --no-fund

# ---------------------------------------------------------------- frontend ----
echo "==> [2/5] dashboard: npm install"
cd "$DIR/agentos-dashboard"
npm install --no-audit --no-fund

echo "==> [3/5] dashboard: production build"
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# ---------------------------------------------------------------- units ----
echo "==> [4/5] systemd units"
cat > /etc/systemd/system/agentos-backend.service <<UNIT
[Unit]
Description=AgentOS backend orchestrator (:3004)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$DIR/agentos-backend
ExecStart=$DIR/agentos-backend/start_backend.sh
Restart=always
RestartSec=3
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
UNIT

# static file server for the built dashboard; fall back to npx serve if missing
if ! command -v serve >/dev/null 2>&1; then
  npm install -g serve >/dev/null 2>&1 || true
fi

cat > /etc/systemd/system/agentos-dashboard.service <<UNIT
[Unit]
Description=Agent OS Dashboard (:3002)
After=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$DIR/agentos-dashboard
ExecStart=$(command -v serve || echo /usr/local/bin/serve) -s dist -l 3002
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now agentos-backend agentos-dashboard

# ---------------------------------------------------------------- health ----
echo "==> [5/5] health check"
ok=0
for i in $(seq 1 15); do
  b=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3004/api/status || true)
  d=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3002/ || true)
  if [ "$b" = "200" ] && [ "$d" = "200" ]; then ok=1; break; fi
  sleep 2
done

if [ "$ok" = "1" ]; then
  echo ""
  echo "✔ Life OS установлен и запущен"
  echo "   backend  : http://127.0.0.1:3004/api/status → 200"
  echo "   dashboard: http://127.0.0.1:3002/ → 200"
  echo "   Дальше: настроить Caddy (deploy/Caddyfile) → https://os.dktunnel.xyz"
  echo "   Компоненты (n8n, Coder, движки): вкладка «Установка компонентов» в UI"
else
  echo "✘ health check не прошёл. Логи: journalctl -u agentos-backend -u agentos-dashboard -n 50"
  exit 1
fi
