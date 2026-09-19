#!/bin/bash
# Life OS Agent Oracle cron — запускает агента и сохраняет результат в заметки дашборда.
# Usage: run_agent_cron.sh <profile> "<prompt>" <notification_label>
set -euo pipefail

PROFILE="$1"; PROMPT="$2"; LABEL="$3"
OUT=/tmp/agentos-cron-${PROFILE}.txt

# Run agent via HERMES CLI with OpenRouter key from backend env file
HERMES_KEY="$(grep '^OPENROUTER_API_KEY=' /root/.hermes/.env | cut -d= -f2- | tr -d '"' | tr -d "'")"
export HERMES_CUSTOM_FREEROUTER_API_KEY=""
export OPENROUTER_API_KEY="$HERMES_KEY"

ANSWER="$(/usr/local/lib/hermes-agent/venv/bin/python /usr/local/lib/hermes-agent/hermes -p "$PROFILE" chat -q "$PROMPT" 2>/dev/null | grep -vE 'Resume this session|Session:|Title:|Duration:|Query:|Messages:|Goodbye|Initializing' | sed '/^\s*$/d' | tail -60)"

# POST to backend notes endpoint
python3 - "$LABEL" "$PROFILE" "$ANSWER" <<'PY'
import os, sys, json, urllib.request
label, profile, answer = sys.argv[1], sys.argv[2], sys.argv[3]
if not answer.strip():
    print("[cron] пустой ответ, не сохраняю"); sys.exit(0)
try:
    with urllib.request.urlopen('http://127.0.0.1:3004/api/notes', timeout=5) as r:
        all_notes = json.loads(r.read()) or []
except Exception:
    all_notes = []
note = {
    "id": f"N-{int(__import__('time').time()*1000)}",
    "title": f"{label} — {__import__('datetime').date.today().isoformat()}",
    "type": "automation",
    "tags": ["automation", "cron", profile],
    "content": answer,
    "excerpt": answer[:150] + "…",
    "updated": __import__('datetime').date.today().isoformat(),
}
req = urllib.request.Request('http://127.0.0.1:3004/api/notes', data=json.dumps([note]+all_notes).encode(), headers={'Content-Type':'application/json'}, method='POST')
urllib.request.urlopen(req, timeout=5)
print(f"[cron] сохранено: {note['title']}")
PY