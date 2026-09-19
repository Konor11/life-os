#!/bin/bash
export PATH="/root/.deepseek/bin:/root/.codex/bin:/root/.claude/local/bin:/root/.openclaw/bin:/root/.dsh/bin:/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin:$PATH"; cd /root && dsh web --no-open --port 3080 --trusted-host ds.dktunnel.xyz >> /tmp/lifeos-web-deepseek.log 2>&1
