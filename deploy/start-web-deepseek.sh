#!/bin/bash
# DeepSeek/dsh web launcher. The trusted host comes from the domain recorded at install time
# (/root/.deepseek-domain), else <id>.<Life OS base domain> taken from the generated
# Caddyfile — a baked-in subdomain from an older deployment pointed at a foreign host.
DOM="$(cat /root/.deepseek-domain 2>/dev/null || true)"
if [ -z "$DOM" ]; then
  B="$(grep -oP 'base domain:\s*\K\S+' /etc/caddy/Caddyfile 2>/dev/null | head -1)"
  [ -n "$B" ] && DOM="deepseek.$B"
fi
export PATH="/root/.deepseek/bin:/root/.codex/bin:/root/.claude/local/bin:/root/.openclaw/bin:/root/.dsh/bin:/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin:$PATH"
cd /root && dsh web --no-open --port 3080 ${DOM:+--trusted-host "$DOM"} >> /tmp/lifeos-web-deepseek.log 2>&1
