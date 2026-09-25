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
#   6. (опционально) Caddyfile для базового домена + поддоменов движков
#
# Optional components (AI engines, n8n, Coder) are NOT installed here —
# they are installed from the UI: Настройки life os → «Установка компонентов».
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
echo "==> [1/6] backend: npm install"
cd "$DIR/agentos-backend"
npm install --no-audit --no-fund

# ---------------------------------------------------------------- frontend ----
echo "==> [2/6] dashboard: npm install"
cd "$DIR/agentos-dashboard"
npm install --no-audit --no-fund

echo "==> [3/6] dashboard: production build + agent-definitions.json"
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
echo "==> [4/6] systemd unit: lifeos.service (backend + dashboard в одном)"

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
echo "==> [6/6] Caddyfile (опционально)"

# Если Caddy не стоит — просто выводим сгенерированный конфиг и инструкцию.
if ! command -v caddy >/dev/null 2>&1 && ! docker ps --format '{{.Names}}' | grep -q '^caddy$'; then
  echo "   Caddy не обнаружен (ни systemd, ни docker). Сгенерирую deploy/Caddyfile —"
  echo "   настройте его вручную или положите в /etc/caddy/Caddyfile и перезапустите Caddy."
  GENERATE_ONLY=1
else
  GENERATE_ONLY=0
fi

# Читаем предыдущий домен из существующего Caddyfile, если есть
PREV_DOMAIN=""
if [ -f "$DIR/deploy/Caddyfile" ]; then
  PREV_DOMAIN=$(grep -E '^os\.' "$DIR/deploy/Caddyfile" | head -1 | sed 's/^os\.//; s/ .*//')
fi

# Спрашиваем домен
if [ -t 0 ]; then
  # Интерактивный терминал — спрашиваем
  if [ -n "$PREV_DOMAIN" ]; then
    read -rp "   Базовый домен для Life OS (например, example.com) [$PREV_DOMAIN]: " BASE_DOMAIN
    BASE_DOMAIN="${BASE_DOMAIN:-$PREV_DOMAIN}"
  else
    read -rp "   Базовый домен для Life OS (например, example.com): " BASE_DOMAIN
  fi
else
  # Неинтерактивно (CI, pipe) — берём из env или предыдущего
  BASE_DOMAIN="${LIFEOS_DOMAIN:-$PREV_DOMAIN}"
fi

if [ -z "$BASE_DOMAIN" ]; then
  echo "   Домен не задан — пропускаю генерацию Caddyfile."
  echo "   Настройте Caddy вручную: deploy/Caddyfile → /etc/caddy/Caddyfile"
else
  # Валидация: простой формат domain.tld
  if ! [[ "$BASE_DOMAIN" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    echo "   ⚠ Формат домена подозрительный: '$BASE_DOMAIN' — ожидается example.com"
    echo "   Генерирую как есть, проверьте вручную."
  fi

  OS_DOMAIN="os.$BASE_DOMAIN"
  OC_DOMAIN="oc.$BASE_DOMAIN"
  DS_DOMAIN="ds.$BASE_DOMAIN"
  N8N_DOMAIN="n8n.$BASE_DOMAIN"
  ADMIN_DOMAIN="admin.$BASE_DOMAIN"
  HERMES_DOMAIN="hermes.$BASE_DOMAIN"
  WORKSPACE_DOMAIN="workspace.$BASE_DOMAIN"

  echo "   Генерирую Caddyfile для:"
  echo "     $OS_DOMAIN (Life OS)"
  echo "     $OC_DOMAIN (OpenCode)"
  echo "     $DS_DOMAIN (DeepSeek)"
  echo "     $N8N_DOMAIN (n8n)"
  echo "     $ADMIN_DOMAIN (Admin UI)"
  echo "     $HERMES_DOMAIN (Hermes gateway)"
  echo "     $WORKSPACE_DOMAIN (Hermes Workspace)"

  cat > "$DIR/deploy/Caddyfile" <<CADDY
# Auto-generated by deploy/install.sh for base domain: $BASE_DOMAIN
# DO NOT EDIT MANUALLY — re-run install.sh to regenerate.

$ADMIN_DOMAIN {
    handle {
        reverse_proxy web-frontend:80
    }
    handle /api/* {
        reverse_proxy 127.0.0.1:3004 {
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }
    handle /ws/* {
        reverse_proxy 127.0.0.1:3004
    }
}

$HERMES_DOMAIN {
    reverse_proxy 127.0.0.1:9119
}

$WORKSPACE_DOMAIN {
    reverse_proxy 127.0.0.1:3001
}

# n8n self-hosted workflow automation on its own subdomain.
# Referer-gated: only reachable from within Life OS (Referer $OS_DOMAIN) or directly.
$N8N_DOMAIN {
    @fromLifeOS {
        header Referer *$OS_DOMAIN*
    }
    @self {
        header Referer *$N8N_DOMAIN*
    }
    @framed {
        path /assets/*
        path /static/*
    }
    @framedApi {
        path /rest/*
    }
    handle @fromLifeOS {
        reverse_proxy 127.0.0.1:5678
    }
    handle @self {
        reverse_proxy 127.0.0.1:5678
    }
    handle @framed {
        reverse_proxy 127.0.0.1:5678
    }
    handle @framedApi {
        reverse_proxy 127.0.0.1:5678
    }
    respond 403
}

# OpenCode on its OWN subdomain, served at ROOT path.
# Referer-gated: only from Life OS ($OS_DOMAIN) or same-origin ($OC_DOMAIN).
$OC_DOMAIN {
    @fromLifeOS {
        header Referer *$OS_DOMAIN*
    }
    @self {
        header Referer *$OC_DOMAIN*
    }
    handle @fromLifeOS {
        reverse_proxy 127.0.0.1:4096
    }
    handle @self {
        reverse_proxy 127.0.0.1:4096
    }
    respond 403
}

# DeepSeek (dsh) — same pattern as OpenCode: SPA with root-absolute paths.
# Referer-gated: only from Life OS ($OS_DOMAIN) or same-origin ($DS_DOMAIN).
# Also accepts cookie-based auth (dsh sets dsh-auth cookie).
$DS_DOMAIN {
    @fromLifeOS {
        header Referer *$OS_DOMAIN*
    }
    @self {
        header Referer *$DS_DOMAIN*
    }
    @authed {
        header Cookie *dsh-auth*
    }
    handle @fromLifeOS {
        reverse_proxy 172.18.0.1:3090
    }
    handle @self {
        reverse_proxy 172.18.0.1:3090
    }
    handle @authed {
        reverse_proxy 172.0.0.1:3090
    }
    respond 403
}

# Main Life OS domain: API, WS, embedded engine proxies, SPA fallback.
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
        Content-Security-Policy "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://unpkg.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' wss://$OS_DOMAIN https://$OS_DOMAIN https://$OC_DOMAIN https://$DS_DOMAIN https://$N8N_DOMAIN; frame-src 'self' https://$WORKSPACE_DOMAIN https://$OS_DOMAIN https://$OC_DOMAIN https://$DS_DOMAIN https://$N8N_DOMAIN"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
CADDY

  echo "   ✓ deploy/Caddyfile обновлён"

  if [ "$GENERATE_ONLY" = "0" ]; then
    # Пытаемся применить: если Caddy в docker — рестартуем контейнер,
    # если systemd — reload.
    if docker ps --format '{{.Names}}' | grep -q '^caddy$'; then
      echo "   Перезапускаю Caddy (docker)..."
      # Предполагаем, что Caddyfile смонтирован в контейнер из deploy/Caddyfile
      # или нужно скопировать в /etc/caddy/Caddyfile. Пробуем оба варианта.
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
if [ -n "$BASE_DOMAIN" ]; then
  echo "OpenCode:     https://$OC_DOMAIN (только из Life OS iframe)"
  echo "DeepSeek:     https://$DS_DOMAIN (только из Life OS iframe)"
  echo "n8n:          https://$N8N_DOMAIN (только из Life OS iframe)"
  echo "Admin UI:     https://$ADMIN_DOMAIN"
  echo "Hermes GW:    https://$HERMES_DOMAIN"
  echo "Workspace:    https://$WORKSPACE_DOMAIN"
fi
echo "Компоненты (n8n, Coder, движки): вкладка «Установка компонентов» в UI"
echo "Логи:         journalctl -u lifeos -f"