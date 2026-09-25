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
#   6. (опционально) Caddyfile для os.<domain> — только Life OS
#
# Optional components (AI engines, n8n, Coder) are NOT installed here —
# they are installed from the UI: Настройки life os → «Установка компонентов».
# =============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "==> Life OS directory: $DIR"

command -v systemctl >/dev/null 2>&1 || { echo "✘ systemd не найден — этот скрипт для прод-сервера с systemd"; exit 1; }

# -------------------------------------------------- install prerequisites ----
# Определяем пакетный менеджер (apt/dnf/yum/pacman/zypper)
PKG=""
if command -v apt-get >/dev/null 2>&1; then PKG="apt"
elif command -v dnf >/dev/null 2>&1; then PKG="dnf"
elif command -v yum >/dev/null 2>&1; then PKG="yum"
elif command -v pacman >/dev/null 2>&1; then PKG="pacman"
elif command -v zypper >/dev/null 2>&1; then PKG="zypper"
fi

install_pkg() {
  case "$PKG" in
    apt)    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$1" ;;
    dnf)    dnf install -y -q "$1" ;;
    yum)    yum install -y -q "$1" ;;
    pacman) pacman -S --noconfirm "$1" ;;
    zypper) zypper --non-interactive install "$1" ;;
  esac
}

# curl — нужен для health check
if ! command -v curl >/dev/null 2>&1; then
  echo "==> ставлю curl"
  [ -n "$PKG" ] && install_pkg curl || { echo "✘ curl не найден и пакетный менеджер не определён — поставь вручную"; exit 1; }
fi

# Node.js 18+ — ставим через NodeSource, если нет или слишком старый
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
  [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null && NODE_OK=1
fi
if [ "$NODE_OK" != "1" ]; then
  echo "==> ставлю Node.js 20 (NodeSource)"
  if [ "$PKG" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
  elif [ "$PKG" = "dnf" ] || [ "$PKG" = "yum" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null
    "$PKG" install -y -q nodejs
  else
    echo "✘ не могу поставить Node автоматически (pkg=$PKG) — поставь Node 18+ вручную"
    exit 1
  fi
fi
command -v node >/dev/null 2>&1 || { echo "✘ node не появился после установки"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "✘ npm не появился после установки"; exit 1; }

# Сборочные тулзы — нативные модули (node-pty) собираются через node-gyp,
# которому нужны make и g++; python3 тоже нужен (обычно уже есть)
if ! command -v make >/dev/null 2>&1 || ! command -v g++ >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  echo "==> ставлю build tools (make, g++, python3)"
  case "$PKG" in
    apt)    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq build-essential python3 ;;
    dnf)    dnf install -y -q gcc-c++ make python3 ;;
    yum)    yum install -y -q gcc-c++ make python3 ;;
    pacman) pacman -S --noconfirm base-devel python ;;
    zypper) zypper --non-interactive install gcc-c++ make python3 ;;
    *)      echo "✘ не могу поставить build tools автоматически (pkg=$PKG) — поставь make и g++ вручную"; exit 1 ;;
  esac
fi

# Caddy — ставим через официальный репозиторий, если нет ни бинарника, ни docker-caddy
CADDY_PRESENT=0
command -v caddy >/dev/null 2>&1 && CADDY_PRESENT=1
docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^caddy$' && CADDY_PRESENT=1
if [ "$CADDY_PRESENT" != "1" ]; then
  echo "==> ставлю Caddy"
  if [ "$PKG" = "apt" ]; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl >/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy
  elif [ "$PKG" = "dnf" ] || [ "$PKG" = "yum" ]; then
    tee /etc/yum.repos.d/caddy.repo >/dev/null <<'REPO'
[caddy-stable]
name=Caddy Stable Repository
baseurl=https://dl.cloudsmith.io/public/caddy/stable/rpm/el_any/
gpgcheck=1
repo_gpgcheck=1
enabled=1
gpgkey=https://dl.cloudsmith.io/public/caddy/stable/gpg.key
REPO
    "$PKG" install -y -q caddy
  else
    echo "✘ не могу поставить Caddy автоматически (pkg=$PKG) — поставь вручную: https://caddyserver.com/docs/install"
    echo "   (продолжаю без Caddy — сгенерирую только Caddyfile)"
  fi
fi

# ------------------------------------------------------- stop legacy units ----
systemctl disable --now lifeos-stack.service 2>/dev/null || true
systemctl disable --now agentos-backend.service 2>/dev/null || true
systemctl disable --now agentos-dashboard.service 2>/dev/null || true
pkill -f '[a]gentos-stack.sh' 2>/dev/null || true
pkill -f '[n]ode server.js' 2>/dev/null || true
pkill -f '[s]erve -s .*agentos-dashboard/dist' 2>/dev/null || true
sleep 1

# ---------------------------------------------------------------- backend ----
echo "==> [1/6] backend: npm install"
cd "$DIR/agentos-backend"
npm install --no-audit --no-fund

# ---------------------------------------------------------------- frontend ----
echo "==> [2/6] dashboard: npm install"
cd "$DIR/agentos-dashboard"
npm install --no-audit --no-fund

echo "==> [3/6] dashboard: production build + agent-definitions.json"
NODE_OPTIONS="--max-old-space-size=4096" npm run build

node --input-type=module -e "
import { AGENT_DEFINITIONS } from 'file://$DIR/agentos-dashboard/src/config/agents/index.js';
import fs from 'fs';
fs.writeFileSync('$DIR/agentos-backend/agent-definitions.json', JSON.stringify(AGENT_DEFINITIONS, null, 2));
console.log('agent-definitions.json:', AGENT_DEFINITIONS.length, 'agents');
"

# ---------------------------------------------------------------- units ----
echo "==> [4/6] systemd unit: lifeos.service (backend + dashboard в одном)"

if ! command -v serve >/dev/null 2>&1; then
  npm install -g serve >/dev/null 2>&1 || true
fi

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
echo "==> [5/6] health check"
ok=0
for i in $(seq 1 15); do
  b=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3004/api/status || true)
  d=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3002/ || true)
  if [ "$b" = "200" ] && [ "$d" = "200" ]; then ok=1; break; fi
  sleep 2
done

if [ "$ok" != "1" ]; then
  echo "✘ health check не прошёл. Логи: journalctl -u lifeos -n 50"
  exit 1
fi

echo ""
echo "✔ Life OS установлен и запущен (lifeos.service)"
echo "   backend  : http://127.0.0.1:3004/api/status → 200"
echo "   dashboard: http://127.0.0.1:3002/ → 200"
echo "   Логи     : journalctl -u lifeos -f"

# ---------------------------------------------------------------- Caddy ------
echo "==> [6/6] Caddyfile для os.<domain> (опционально)"

if ! command -v caddy >/dev/null 2>&1 && ! docker ps --format '{{.Names}}' | grep -q '^caddy$'; then
  echo "   Caddy не обнаружен (ни systemd, ни docker). Сгенерирую deploy/Caddyfile —"
  echo "   настройте его вручную или положите в /etc/caddy/Caddyfile и перезапустите Caddy."
  GENERATE_ONLY=1
else
  GENERATE_ONLY=0
fi

PREV_DOMAIN=""
if [ -f "$DIR/deploy/Caddyfile" ]; then
  PREV_DOMAIN=$(grep -E '^os\\.' "$DIR/deploy/Caddyfile" | head -1 | sed 's/^os\\.//; s/ .*//')
fi

if [ -t 0 ]; then
  if [ -n "$PREV_DOMAIN" ]; then
    read -rp "   Базовый домен для Life OS (например, example.com) [$PREV_DOMAIN]: " BASE_DOMAIN
    BASE_DOMAIN="${BASE_DOMAIN:-$PREV_DOMAIN}"
  else
    read -rp "   Базовый домен для Life OS (например, example.com): " BASE_DOMAIN
  fi
else
  BASE_DOMAIN="${LIFEOS_DOMAIN:-$PREV_DOMAIN}"
fi

if [ -z "$BASE_DOMAIN" ]; then
  echo "   Домен не задан — пропускаю генерацию Caddyfile."
  echo "   Настройте Caddy вручную: deploy/Caddyfile → /etc/caddy/Caddyfile"
else
  if ! [[ "$BASE_DOMAIN" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    echo "   ⚠ Формат домена подозрительный: '$BASE_DOMAIN' — ожидается example.com"
    echo "   Генерирую как есть, проверьте вручную."
  fi

  OS_DOMAIN="os.$BASE_DOMAIN"

  echo "   Генерирую Caddyfile для: $OS_DOMAIN (Life OS)"

  cat > "$DIR/deploy/Caddyfile" <<CADDY
# Auto-generated by deploy/install.sh for base domain: $BASE_DOMAIN
# DO NOT EDIT MANUALLY — re-run install.sh to regenerate.
# Other subdomains (admin, hermes, workspace, engines) are managed separately.

$OS_DOMAIN {
    handle /api/* {
        reverse_proxy 127.0.0.1:3004
    }
    handle /ws/* {
        reverse_proxy 127.0.0.1:3004
    }
    handle /ocapi/* {
        uri replace /ocapi /api
        reverse_proxy 127.0.0.1:4096
    }
    handle /agent/openclaw/* {
        reverse_proxy 127.0.0.1:6286
    }
    handle {
        reverse_proxy 127.0.0.1:3002
        header Cache-Control "no-store, no-cache, max-age=0"
    }
    header {
        Content-Security-Policy "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://unpkg.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' wss://$OS_DOMAIN https://$OS_DOMAIN; frame-src 'self' https://$OS_DOMAIN"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
CADDY

  echo "   ✓ deploy/Caddyfile обновлён"

  if [ "$GENERATE_ONLY" = "0" ]; then
    if docker ps --format '{{.Names}}' | grep -q '^caddy$'; then
      echo "   Перезапускаю Caddy (docker)..."
      if [ -f /etc/caddy/Caddyfile ]; then
        cp "$DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
      fi
      docker restart caddy >/dev/null && echo "   ✓ Caddy перезапущен" || echo "   ⚠ docker restart caddy не удался — проверьте вручную"
    elif systemctl is-active --quiet caddy 2>/dev/null; then
      echo "   Перезагружаю Caddy (systemd)..."
      cp "$DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
      systemctl reload caddy && echo "   ✓ Caddy перезагружен" || echo "   ⚠ systemctl reload caddy не удался — проверьте вручную"
    else
      echo "   Caddy найден, но не как docker и не как systemd — примените deploy/Caddyfile вручную"
    fi
  fi
fi

echo ""
echo "=== ИТОГ ==="
echo "Life OS:      https://$OS_DOMAIN"
echo "Компоненты (n8n, Coder, движки): вкладка «Установка компонентов» в UI"
echo "Логи:         journalctl -u lifeos -f"