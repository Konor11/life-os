#!/bin/bash
# LifeOS supervisor: backend (:3004) + dashboard (:3002) в одном systemd-сервисе.
# Если один из процессов умирает — убиваем второй и выходим с ошибкой:
# systemd перезапустит ВСЁ вместе (Restart=always в lifeos.service).
set -u
export PYTHONUNBUFFERED=1

LIFEOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$LIFEOS_DIR/agentos-backend/start_backend.sh" &
P1=$!

/usr/local/bin/serve -s "$LIFEOS_DIR/agentos-dashboard/dist" -l 3002 &
P2=$!

term() {
  kill -TERM "$P1" "$P2" 2>/dev/null
  wait "$P1" "$P2" 2>/dev/null
  exit 0
}
trap term TERM INT

while true; do
  if ! kill -0 "$P1" 2>/dev/null || ! kill -0 "$P2" 2>/dev/null; then
    kill -TERM "$P1" "$P2" 2>/dev/null
    wait 2>/dev/null
    exit 1
  fi
  sleep 5
done
