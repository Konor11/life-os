#!/bin/bash
# Launch AgentOS backend (:3004) with env from /root/.hermes/.env
set -a
# shellcheck disable=source
if [ -f /root/.hermes/.env ]; then
  while IFS='=' read -r k v; do
    case "$k" in OPENROUTER_API_KEY|TELEGRAM_BOT_TOKEN|HERMES_*|GOOGLE_*|NOTION_*|GITHUB_*|OPENAI_API_KEY)
      [ -n "$k" ] && [ -n "$v" ] && export "$k=$v" ;;
    esac
  done < /root/.hermes/.env
fi
set +a
unset HERMES_TUI_GATEWAY_URL
cd /root/agentos-backend
exec node server.js