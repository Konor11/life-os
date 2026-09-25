#!/usr/bin/env bash
# =============================================================================
# Life OS — bootstrap: скачать исходники и запустить установку одной командой
#
#   curl -fsSL https://raw.githubusercontent.com/Konor11/life-os/main/deploy/bootstrap.sh | bash
#
# Делает сам:
#   1. git (ставит, если нет)
#   2. клонирует репо в /root/life-os (обновляет, если уже клонирован;
#      путь можно переопределить: LIFEOS_DIR=/srv/life-os bash bootstrap.sh)
#   3. запускает deploy/install.sh — дальше он ставит node, caddy, curl,
#      собирает дашборд, пишет lifeos.service и спрашивает домен
# =============================================================================
set -euo pipefail

REPO="https://github.com/Konor11/life-os.git"
LIFEOS_DIR="${LIFEOS_DIR:-/root/life-os}"

echo "==> Life OS bootstrap"
echo "    репозиторий: $REPO"
echo "    каталог:     $LIFEOS_DIR"

# --- git ----------------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  echo "==> ставлю git"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git
  elif command -v dnf >/dev/null 2>&1; then dnf install -y -q git
  elif command -v yum >/dev/null 2>&1; then yum install -y -q git
  elif command -v pacman >/dev/null 2>&1; then pacman -S --noconfirm git
  elif command -v zypper >/dev/null 2>&1; then zypper --non-interactive install git
  else echo "✘ git не найден и пакетный менеджер не определён — поставь git вручную"; exit 1
  fi
fi

# --- clone / update ------------------------------------------------------------
if [ -d "$LIFEOS_DIR/.git" ]; then
  echo "==> обновляю существующий клон"
  git -C "$LIFEOS_DIR" fetch --depth 1 origin main
  git -C "$LIFEOS_DIR" reset --hard origin/main
else
  echo "==> клонирую репозиторий"
  rm -rf "$LIFEOS_DIR"
  git clone --depth 1 "$REPO" "$LIFEOS_DIR"
fi

# --- install -------------------------------------------------------------------
echo "==> запускаю deploy/install.sh"
cd "$LIFEOS_DIR"
bash deploy/install.sh