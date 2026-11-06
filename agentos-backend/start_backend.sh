#!/bin/bash
# Launch AgentOS backend (:3004) with env from ~/.hermes/.env
# HOME задаёт systemd (см. deploy/install.sh): /root для root-установки, иначе home владельца.
set -a
# shellcheck disable=source
if [ -f "$HOME/.hermes/.env" ]; then
  while IFS='=' read -r k v; do
    case "$k" in OPENROUTER_API_KEY|TELEGRAM_BOT_TOKEN|HERMES_*|GOOGLE_*|NOTION_*|GITHUB_*|OPENAI_API_KEY)
      [ -n "$k" ] && [ -n "$v" ] && export "$k=$v" ;;
    esac
  done < "$HOME/.hermes/.env"
fi
set +a
unset HERMES_TUI_GATEWAY_URL
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node server.js