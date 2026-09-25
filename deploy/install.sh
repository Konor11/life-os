#!/usr/bin/env bash
# =============================================================================
# Life OS — one-command production install
#
#   sudo bash deploy/install.sh
#
# Installs ONLY Life OS (backend + dashboard) from this repo:
#   1. npm install (backend, dashboard)
#   2. dashboard production build (Vite; needs the raised heap)
#   3. agent-definitions.json (генерится из src/config/agents — в рантайме
#      server.js читает его через readFileSync, ESM он не умеет)
#   4. ОДИН systemd-юнит: lifeos.service — backend (:3004) + dashboard (:3002)
#      под супервизором deploy/lifeos-stack.sh; упал один процесс —
#      systemd перезапускает стек целиком
#   5. enable --now + health check
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

# ------------------------------------------------------- stop legacy units ----
# Прежние схемы (два отдельных юнита + первый супервизор с багом запуска
# dashboard) — гасим, чтобы не словить EADDRINUSE от зомби-процессов.
systemctl disable --now lifeos-stack.service 2>/dev/null || true
systemctl disable --now agentos-backend.service 2>/dev/null || true
systemctl disable --now agentos-dashboard.service 2>/dev/null || true
pkill -f '[a]gentos-stack.sh' 2>/dev/null || true
pkill -f '[n]ode server.js' 2>/dev/null || true
pkill -f '[s]erve -s .*agentos-dashboard/dist' 2>/dev/null || true
sleep 1

# ---------------------------------------------------------------- backend ----
echo "==> [1/5] backend: npm install"
cd "$DIR/agentos-backend"
npm install --no-audit --no-fund

# ---------------------------------------------------------------- frontend ----
echo "==> [2/5] dashboard: npm install"
cd "$DIR/agentos-dashboard"
npm install --no-audit --no-fund

echo "==> [3/5] dashboard: production build + agent-definitions.json"
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# agent-definitions.json: реестр агентов генерится из frontend-конфига на этапе
# сборки. server.js читает его через readFileSync — ESM-импорт в рантайме
# падает молча, поэтому JSON обязателен.
node --input-type=module -e "
import { AGENT_DEFINITIONS } from 'file://$DIR/agentos-dashboard/src/config/agents/index.js';
import fs from 'fs';
fs.writeFileSync('$DIR/agentos-backend/agent-definitions.json', JSON.stringify(AGENT_DEFINITIONS, null, 2));
console.log('agent-definitions.json:', AGENT_DEFINITIONS.length, 'agents');
"

# ---------------------------------------------------------------- units ----
echo "==> [4/5] systemd unit: lifeos.service (backend + dashboard в одном)"

# static file server for the built dashboard; fall back to npm i -g if missing
if ! command -v serve >/dev/null 2>&1; then
  npm install -g serve >/dev/null 2>&1 || true
fi
SERVE_BIN="$(command -v serve || echo /usr/local/bin/serve)"

cat > /etc/systemd/system/lifeos.service <<UNIT
[Unit]
Description=LifeOS stack (agentos backend :3004 + dashboard :3002)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=$DIR/deploy/lifeos-stack.sh
Restart=always
RestartSec=3
TimeoutStopSec=15
KillMode=control-group

[Install]
WantedBy=multi-user.target
UNIT

chmod +x "$DIR/deploy/lifeos-stack.sh" "$DIR/agentos-backend/start_backend.sh"

systemctl daemon-reload
systemctl enable --now lifeos.service

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
  echo "✔ Life OS установлен и запущен (lifeos.service)"
  echo "   backend  : http://127.0.0.1:3004/api/status → 200"
  echo "   dashboard: http://127.0.0.1:3002/ → 200"
  echo "   Логи     : journalctl -u lifeos -f"
  echo "   Дальше: настроить Caddy (deploy/Caddyfile) → https://os.dktunnel.xyz"
  echo "   Компоненты (n8n, Coder, движки): вкладка «Установка компонентов» в UI"
else
  echo "✘ health check не прошёл. Логи: journalctl -u lifeos -n 50"
  exit 1
fi
