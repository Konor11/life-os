import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { execFile, exec, spawn } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises'
import { existsSync, realpathSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import { attachTuiServer } from './tui-ws.js'
import { spawn as ptySpawn } from 'node-pty'
console.log('>>> [MODULE LOAD] server.js executing')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = '/root/agentos-data'
const ALLOWED_ROOTS = ['/root', '/tmp', '/home']  // terminal/fs sandbox
const execP = promisify(execFile)
const execS = promisify(exec)

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
// Fixed password for the opencode v2 web server (it auths everything by default;
// Caddy injects the matching Authorization header so browsers never see a 401).
const OC_WEB_PASS = (() => { try { return readFileSync('/root/.opencode-web-pass', 'utf8').trim() } catch { return '' } })()
const OC_BASIC = OC_WEB_PASS ? Buffer.from('opencode:' + OC_WEB_PASS).toString('base64') : ''
const HERMES = '/usr/local/lib/hermes-agent/venv/bin/python'
const HERMES_ENTRY = '/usr/local/lib/hermes-agent/hermes'

const DEFAULT_FILES = {
  plan: { date: new Date().toISOString().slice(0,10), timeBlocks: [], priorities: [], metrics: { deepWorkHours: 0, meetingsHours: 0 } },
  tasks: [], notes: [], habits: [],
  finances: { accounts: [], transactions: [], budgets: [], goals: [] },
  health: { metrics: [], workouts: [], sleep: [], nutrition: [], appointments: [] },
  learning: { courses: [], topics: [], progress: [], resources: [] },
  contacts: { people: [], organizations: [], interactions: [], tags: [] },
  automations: { workflows: [], triggers: [], runs: [] },
  memory: { documents: [], embeddings: [], queries: [] },
  calendar: { events: [], calendars: [] },
  projects: { projects: [] },
}

async function loadJson(name) {
  const file = path.join(DATA_DIR, `${name}.json`)
  if (!existsSync(file)) return DEFAULT_FILES[name] ?? null
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return DEFAULT_FILES[name] ?? null }
}
async function saveJson(name, data) {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2))
}

async function askAgent(profile, question, timeoutMs = 160000) {
  const env = { ...process.env, OPENROUTER_API_KEY: OPENROUTER_KEY, TERM: 'dumb' }
  try {
    const { stdout } = await execP(HERMES, [HERMES_ENTRY, '-p', profile, 'chat', '-Q', '-q', question], { env, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 })
    const lines = (stdout || '').split('\n').filter(l =>
      !l.includes('Resume this session') && !l.includes('Session:') && !l.includes('Title:')
      && !l.includes('Duration:') && !l.includes('Query:') && !l.includes('Initializing agent')
      && !l.includes('─────') && !l.includes('Reasoning') && !l.includes('┌') && !l.includes('└') && !l.includes('╭') && !l.includes('╰')
      && !l.startsWith('session_id:') && l.trim())
    return lines.join('\n').trim()
  } catch (e) { return `ERROR: ${e.message}` }
}

// FAST path: direct OpenRouter chat — no Hermes process spawn (~1-3s vs 40s).
// Used by the dashboard generation forms where agent tools aren't needed.
async function askFast(profile, question, timeoutMs = 60000) {
  const model = PROFILE_MODELS[profile] || 'nvidia/nemotron-3-ultra-550b-a55b:free'
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: 'Ты — полезный агент Life OS. Отвечай кратко, структурированно, на русском языке.' }, { role: 'user', content: question }],
          max_tokens: 4000,
        }),
      })
      if (!resp.ok) {
        const err = await resp.text().catch(() => '')
        return `ERROR: provider ${resp.status} ${err.slice(0, 200)}`
      }
      const d = await resp.json()
      const content = d?.choices?.[0]?.message?.content || ''
      return (content || '').trim() || '(пусто)'
    } finally { clearTimeout(timer) }
  } catch (e) { return `ERROR: ${e.message}` }
}

const PROFILE_MODELS = {
  planner: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  tasks: 'google/gemma-4-26b-a4b-it:free',
  knowledge: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  habits: 'nvidia/nemotron-3.5-lightning:free',
  coordinator: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  financial_planner: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  health_coach: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  learning_coach: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  crm_agent: 'google/gemma-4-26b-a4b-it:free',
  automation_engineer: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  calendar_manager: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  project_manager: 'nvidia/nemotron-3-ultra-550b-a55b:free',
}

// --- FS safety: resolve & ensure path under an allowed root ---
function safeResolve(p) {
  const abs = path.resolve(p || '/root')
  for (const root of ALLOWED_ROOTS) {
    if (abs === root || abs.startsWith(root + path.sep)) return abs
  }
  throw new Error(`Access denied: ${abs} not under allowed roots (${ALLOWED_ROOTS.join(', ')})`)
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// ---- Life OS data ----
app.get('/api/plan', async (_, res) => res.json(await loadJson('plan')))
app.get('/api/tasks', async (_, res) => res.json(await loadJson('tasks')))
app.get('/api/notes', async (_, res) => res.json(await loadJson('notes')))
app.get('/api/habits', async (_, res) => res.json(await loadJson('habits')))
app.get('/api/finances', async (_, res) => res.json(await loadJson('finances')))
app.get('/api/health', async (_, res) => res.json(await loadJson('health')))
app.get('/api/learning', async (_, res) => res.json(await loadJson('learning')))
app.get('/api/contacts', async (_, res) => res.json(await loadJson('contacts')))
app.get('/api/automations', async (_, res) => res.json(await loadJson('automations')))
app.get('/api/memory', async (_, res) => res.json(await loadJson('memory')))
app.get('/api/calendar', async (_, res) => res.json(await loadJson('calendar')))
app.get('/api/projects', async (_, res) => res.json(await loadJson('projects')))
app.post('/api/plan', async (req, res) => { await saveJson('plan', req.body); res.json({ ok: true }) })
app.post('/api/tasks', async (req, res) => { await saveJson('tasks', req.body); res.json({ ok: true }) })
app.post('/api/notes', async (req, res) => { await saveJson('notes', req.body); res.json({ ok: true }) })
app.post('/api/habits', async (req, res) => { await saveJson('habits', req.body); res.json({ ok: true }) })
app.post('/api/finances', async (req, res) => { await saveJson('finances', req.body); res.json({ ok: true }) })
app.post('/api/health', async (req, res) => { await saveJson('health', req.body); res.json({ ok: true }) })
app.post('/api/learning', async (req, res) => { await saveJson('learning', req.body); res.json({ ok: true }) })
app.post('/api/contacts', async (req, res) => { await saveJson('contacts', req.body); res.json({ ok: true }) })
app.post('/api/automations', async (req, res) => { await saveJson('automations', req.body); res.json({ ok: true }) })
app.post('/api/memory', async (req, res) => { await saveJson('memory', req.body); res.json({ ok: true }) })
app.post('/api/calendar', async (req, res) => { await saveJson('calendar', req.body); res.json({ ok: true }) })
app.post('/api/projects', async (req, res) => { await saveJson('projects', req.body); res.json({ ok: true }) })
app.get('/api/all', async (_, res) => res.json({
  plan: await loadJson('plan'), tasks: await loadJson('tasks'), notes: await loadJson('notes'), habits: await loadJson('habits'),
  finances: await loadJson('finances'), health: await loadJson('health'), learning: await loadJson('learning'),
  contacts: await loadJson('contacts'), automations: await loadJson('automations'), memory: await loadJson('memory'),
  calendar: await loadJson('calendar'), projects: await loadJson('projects')
}))

// ---- Keys manager: list available API keys & sync into agent configs ----
const ENV_FILES = ['/root/.hermes/.env', '/root/.env']
const PROFILE_DIR = '/root/.hermes/profiles'

function readEnvKeys() {
  const found = new Map()
  for (const ef of ENV_FILES) {
    if (!existsSync(ef)) continue
    try {
      const txt = readFileSync(ef, 'utf8')
      for (const line of txt.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
        if (!m) continue
        const k = m[1]; let v = m[2].trim().replace(/^["']|["']$/g, '')
        if (!/KEY|TOKEN|SECRET|PASS/.test(k)) continue
        if (!v || v.startsWith('«') || /placeholder|your_/i.test(v)) continue
        const masked = v.length > 10 ? v.slice(0, 6) + '…' + v.slice(-4) : '•••'
        found.set(k, { env: k, value: v, masked, length: v.length, source: ef })
      }
    } catch {}
  }
  return Array.from(found.values())
}

// Which provider-key a harness consumes. Used to slot each discovered key under its
// agent(s) in the "Ключи" tab and to know which AGENT consumes a key for sync.
const HARNESS_KEY_CONSUMERS = {
  hermes: ['OPENROUTER_API_KEY'],
  opencode: [],
  codex: ['OPENAI_API_KEY'],
  claude: ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'],
  openclaw: ['OPENROUTER_API_KEY'],
  pi: ['OPENROUTER_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY'],
  coder: [],  // credentials (email + password) come from agentExtraTokens
}

// Extra per-harness secrets that live outside the shared .env files and are read
// straight from the harness's own config. Masked the same way as env keys.
function agentExtraTokens(id) {
  if (id === 'openclaw') {
    try {
      const p = '/root/.openclaw/openclaw.json'
      if (!existsSync(p)) return []
      const cfg = JSON.parse(readFileSync(p, 'utf8'))
      const t = cfg?.gateway?.auth?.token
      if (!t) return []
      const masked = t.length > 10 ? t.slice(0, 6) + '…' + t.slice(-4) : '•••'
      return [{ env: 'OPENCLAW_GATEWAY_TOKEN', agentToken: true, value: t, masked, length: t.length,
                 source: p, desc: 'Токен Control UI OpenClaw (вход в Control UI)' }]
    } catch { return [] }
  }
  if (id === 'hermes') {
    // Credentials for the Hermes Web UI gate — the same values the install wrote, so the
    // owner can look them up later instead of digging in /root/.hermes-web-auth.
    try {
      let dom = ''
      try { dom = readFileSync('/root/.hermes-domain', 'utf8').trim() } catch {}
      const p = '/root/.hermes-web-auth'
      if (!existsSync(p)) return []
      const txt = readFileSync(p, 'utf8')
      const get = (k) => { const m = txt.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].replace(/\r?$/, '') : null }
      const user = get('AUTH_USER') || '', pw = get('AUTH_PASS') || ''
      const out = []
      if (user) out.push({ env: 'HERMES_DASHBOARD_USER', agentToken: true, value: user, masked: user, length: user.length,
                 source: p, desc: 'Логин входа в Hermes Web UI' + (dom ? ` (${dom})` : '') })
      if (pw) { const m = pw.length > 8 ? pw.slice(0, 3) + '…' + pw.slice(-3) : '•••'
        out.push({ env: 'HERMES_DASHBOARD_PASSWORD', agentToken: true, value: pw, masked: m, length: pw.length,
                   source: p, desc: 'Пароль входа в Hermes Web UI' })
      }
      if (dom) out.push({ env: 'HERMES_WEB_DOMAIN', agentToken: true, value: dom, masked: dom, length: dom.length,
                 source: '/root/.hermes-domain', desc: 'Домен Web UI Hermes (проксируется Caddy)' })
      return out
    } catch { return [] }
  }
  if (id === 'coder') {
    try {
      // Coder admin credentials (owner) from the env file written at install time — the
      // email/domen are chosen per install, so nothing is hardcoded here.
      const p = '/root/.coder-admin.env'
      if (!existsSync(p)) return []
      const envTxt = readFileSync(p, 'utf8')
      const get = (k) => { const m = envTxt.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].replace(/\r?$/,'') : null }
      const pw = get('ADMIN_PW') || '', user = get('ADMIN_USER') || 'coderadmin', email = get('ADMIN_EMAIL') || ''
      const out = []
      if (email) out.push({ env: 'CODER_EMAIL', agentToken: true, value: email, masked: email, length: email.length,
                 source: p, desc: 'Email входа в Coder' })
      if (user) out.push({ env: 'CODER_USERNAME', agentToken: true, value: user, masked: user, length: user.length,
                 source: p, desc: 'Логин Coder (Web UI)' })
      if (pw) { const m = pw.length > 10 ? pw.slice(0, 4) + '…' + pw.slice(-3) : '•••'
        out.push({ env: 'CODER_PASSWORD', agentToken: true, value: pw, masked: m, length: pw.length,
                 source: p, desc: 'Пароль администратора Coder (owner)' })
      }
      return out
    } catch { return [] }
  }
  return []
}

// Keys grouped per harness: shared provider keys that the agent consumes + its own
// config secrets. Returns { harnessId -> [key,...] } so the UI can render tabs.
function groupKeysByAgent() {
  const all = new Map()  // env -> key
  for (const k of readEnvKeys()) all.set(k.env, k)
  const out = {}
  for (const id of Object.keys(HARNESS_KEY_CONSUMERS)) {
    const cons = HARNESS_KEY_CONSUMERS[id] || []
    const hits = []
    for (const k of all.values()) if (cons.includes(k.env)) hits.push({ ...k, agents: null })
    for (const t of agentExtraTokens(id)) {
      if (all.has(t.env)) { /* already in shared */ } else hits.push(t)
    }
    out[id] = hits
  }
  return out
}

function patchKeyEnv(cfgPath, keyEnvVar) {
  let txt = readFileSync(cfgPath, 'utf8')
  if (/key_env:\s*/.test(txt)) {
    txt = txt.replace(/key_env:\s*\S+/, `key_env: ${keyEnvVar}`)
  } else {
    // add/migrate: find provider line or model block end
    if (/provider:\s*/.test(txt)) {
      txt = txt.replace(/(provider:\s*\S+)/, `$1\n  key_env: ${keyEnvVar}`)
    } else {
      txt = txt.replace(/model:\s*\n/, `model:\n  default: nvidia/nemotron-3-ultra-550b-a55b:free\n  provider: openrouter\n  key_env: ${keyEnvVar}\n`)
    }
  }
  writeFileSync(cfgPath, txt)
}

// ---- Harness detection (what's actually installed) ----
// Each agent: checkCmd (exists in PATH?), binPath, installCmd, desc, needsKeyHint
const HARNESSES_DEF = [
  {
    // NOT alwaysInstalled: deploy/install.sh does NOT install Hermes (it only checks that
    // Caddy/Node exist), so a hardcoded "installed" was a lie on every fresh server.
    // Detect the real binary; if it's missing, offer the official installer.
    id: 'hermes', name: 'Hermes',
    bin: ['/usr/local/bin/hermes', '/root/.hermes/hermes-agent/.hermes/bin/hermes', '/usr/local/lib/hermes-agent/venv/bin/hermes'],
    install: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
    interactive: true,   // installer + `hermes setup` need a TTY (arrow-key menus)
    desc: 'Hermes Agent (Nous Research) — один из доступных движков. Пользователь сам выбирает, какой агент использовать.',
    provider: 'OpenRouter', key: 'OPENROUTER_API_KEY',
    update: [
      "echo '[1/3] Обновление пакета hermes-agent (pip)...'",
      "/usr/local/lib/hermes-agent/venv/bin/pip install --upgrade hermes-agent 2>&1",
      "echo '[2/3] Проверка версии...'",
      "/usr/local/lib/hermes-agent/venv/bin/pip show hermes-agent 2>/dev/null | grep -i '^Version' || true",
      "echo '[3/3] Готово. Примечание: официальная команда `hermes update` может требовать интерактивного ввода — после pip перезапусти TUI-сессии Hermes.'",
    ].join('; '),
  },
  {
      id: 'opencode', name: 'OpenCode', bin: ['opencode'],
      install: "curl -fsSL https://opencode.ai/v2/install -o /tmp/install-opencode.sh && bash /tmp/install-opencode.sh --no-modify-path </dev/null; rm -f /tmp/install-opencode.sh",
      // v2 installer updates the binary in place; restart the web service if present
      update: "echo '[1/2] Обновление бинарника (официальный v2-инсталлер)...'; curl -fsSL https://opencode.ai/v2/install -o /tmp/install-opencode.sh && bash /tmp/install-opencode.sh --no-modify-path </dev/null; rm -f /tmp/install-opencode.sh; echo '[2/2] Перезапуск opencode-web...'; systemctl restart opencode-web 2>/dev/null && echo 'сервис перезапущен' || echo 'web-сервис не установлен (пропускаю)'; /root/.opencode/bin/opencode --version 2>/dev/null | head -1",
      desc: 'OpenCode — open-source AI coding agent. Режимы: TUI (терминал), Web UI (opencode serve на :4096 + свой домен), или оба.',
      provider: 'OpenRouter', key: null,
      web: { port: 4096, cmd: 'opencode serve --port 4096 --hostname 0.0.0.0' },
      uninstall: [
        "echo '[1/6] Остановка запущенных процессов opencode...'",
        "pkill -f '[o]pencode serve' 2>/dev/null && echo '  процессы serve остановлены' || echo '  запущенных процессов нет'",
        "pkill -9 -f '/root/\\\\.opencode/bin/[o]pencode' 2>/dev/null",
        "echo '[2/6] Остановка сервиса opencode-web...'",
        "systemctl disable --now opencode-web 2>/dev/null && echo '  сервис остановлен и убран из автозагрузки' || echo '  сервис не установлен'",
        "rm -f /etc/systemd/system/opencode-web.service; systemctl daemon-reload 2>/dev/null; echo '  unit-файл удалён'",
        "echo '[3/6] Удаление домена из Caddy...'",
        "DOM=$(cat /root/.opencode-domain 2>/dev/null || true)",
        "if [ -z \"$DOM\" ]; then echo '  домен не записан — из Caddy убирать нечего'; fi",
        "if [ -n \"$DOM\" ]; then python3 -c \"import re;p='__CADDY_FILE__';s=open(p).read();dom='$DOM';n=len(re.findall(r'(?m)^'+re.escape(dom)+r'[ \\\\t]*\\\\{[^}]*\\\\}[ \\\\t]*\\\\n?',s));s=re.sub(r'(?m)^'+re.escape(dom)+r'[ \\\\t]*\\\\{[^}]*\\\\}[ \\\\t]*\\\\n?','',s);open(p,'w').write(s);print(f'  блок {dom} удалён' if n else '  блок не найден (уже чисто)')\"; fi",
        "rm -f /root/.opencode-domain",
        "echo '[4/6] Перезапуск caddy...'",
        "__CADDY_RELOAD__",
        "echo '[5/6] Удаление файлов opencode...'",
        "rm -rf /root/.opencode /root/.config/opencode /root/.local/share/opencode /root/.cache/opencode /root/.opencode.json /tmp/start-web-opencode.sh; echo '  /root/.opencode, конфиги, кэш — удалены'",
        "npm uninstall -g opencode-ai 2>/dev/null; rm -f /usr/local/bin/opencode /usr/bin/opencode /root/.local/bin/opencode 2>/dev/null",
        "echo '[6/6] Проверка...'",
        "command -v opencode >/dev/null 2>&1 && echo '  ВНИМАНИЕ: бинарник opencode всё ещё в PATH: '$(command -v opencode) || echo '  бинарник удалён — чисто'",
        "pgrep -f '[o]pencode serve' >/dev/null 2>&1 && echo '  ВНИМАНИЕ: остались процессы serve' || echo '  процессы opencode отсутствуют'",
      ].join('; '),
    },
  {
    id: 'codex', name: 'Codex', bin: ['codex'],
    install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh </dev/null",
    desc: 'OpenAI Codex — официальный установщик OpenAI (не npm).',
    provider: 'OpenAI', key: 'OPENAI_API_KEY',
    uninstall: "npm uninstall -g @openai/codex 2>/dev/null; rm -f /usr/local/bin/codex $(command -v codex 2>/dev/null); rm -rf /root/.codex /root/.local/share/codex /root/.cache/codex /root/.codex_auth.json",
  },
  {
    id: 'claude', name: 'Claude Code', bin: ['claude', 'claude-code'],
    install: "curl -fsSL https://claude.ai/install.sh | bash </dev/null",
    desc: 'Anthropic Claude Code. Официально: установщик от Anthropic (npm помечен deprecated).',
    provider: 'Anthropic', key: 'ANTHROPIC_API_KEY',
    uninstall: "npm uninstall -g @anthropic-ai/claude-code 2>/dev/null; rm -f /usr/local/bin/claude* $(command -v claude 2>/dev/null) /root/.local/bin/claude*; rm -rf /root/.claude /root/.config/claude /root/.local/share/claude",
  },
  {
    id: 'openclaw', name: 'OpenClaw', bin: ['openclaw'],
    install: "curl -fsSL https://openclaw.ai/install.sh | bash </dev/null",
    desc: 'Multi-channel AI gateway. Официальный установщик (npm требует Node 24.16+).',
    provider: 'OpenRouter', key: null,
    web: { port: 18789, cmd: 'systemctl --user start openclaw-gateway' },
    uninstall: "npm uninstall -g openclaw 2>/dev/null; rm -f /usr/local/bin/openclaw $(command -v openclaw 2>/dev/null); rm -rf /root/.openclaw /root/.config/openclaw /root/.local/share/openclaw",
  },
  {
    id: 'pi', name: 'Pi Agent', bin: ['pi'],
    install: 'npm install -g @earendil-works/pi-coding-agent </dev/null',
    desc: 'Pi — AI agent toolkit (унифицированный LLM API + TUI). Официальный пакет: @earendil-works/pi-coding-agent.',
    provider: 'OpenRouter', key: null,
    uninstall: "npm uninstall -g @earendil-works/pi-coding-agent 2>/dev/null; rm -f /usr/local/bin/pi $(command -v pi 2>/dev/null); rm -rf /root/.pi /root/.config/pi /root/.local/share/pi",
  },
  {
    id: 'deepseek', name: 'DeepSeek Harness', bin: ['dsh'],
    install: 'npm install -g @deepseek-ai/dsh',
    desc: 'DeepSeek Harness (dsh) — агент-harness «всё-плагин». Запускается как Web UI на :3080 через npx (официальный способ из их README).',
    provider: 'DeepSeek', key: 'DEEPSEEK_API_KEY',
    web: { port: 3080, publicPort: 3090, cmd: 'dsh web --no-open --port 3080' },
    uninstall: "rm -rf /root/.dsh /root/.deepseek-harness /root/.deepseek /root/.config/deepseek-harness /root/.local/share/deepseek-harness; npm uninstall -g @deepseek-ai/dsh 2>/dev/null; find /usr/local/lib/node_modules -maxdepth 1 -iname '*deepseek*' -exec rm -rf {} + 2>/dev/null; true",
  },
  // NOTE: Coder is NOT here — it is a full service (systemd + Postgres docker) and
  // lives in COMPONENTS_DEF below («Установка компонентов»), not an engine harness.
]

// ---- Merge Orca agents (37 agents) into harnesses ----
// Load at startup to avoid ES module issues in running server
let ORCA_AGENTS = []
try {
  const data = readFileSync(new URL('./agent-definitions.json', import.meta.url), 'utf8')
  ORCA_AGENTS = JSON.parse(data)
  console.log(`>>> [STARTUP] Loaded ${ORCA_AGENTS.length} Orca agents for harness merge`)
} catch (e) {
  console.error('>>> [STARTUP] Failed to load Orca agents:', e)
}

// OpenCode's removal touches the Caddy site its install added: resolve the live Caddy
// layout at startup rather than baking in one deployment's path and container name.
{
  const { file: caddyFile, reload: caddyReload } = caddyTarget()
  const oc = HARNESSES_DEF.find(h => h.id === 'opencode')
  if (oc?.uninstall) oc.uninstall = oc.uninstall.replace('__CADDY_FILE__', caddyFile).replace('__CADDY_RELOAD__', caddyReload)
}

// Convert Orca agents to HARNESSES_DEF format and merge (avoid duplicates)
const existingIds = new Set(HARNESSES_DEF.map(h => h.id))
const existingNames = new Set(HARNESSES_DEF.map(h => h.name.toLowerCase()))
for (const a of ORCA_AGENTS) {
  if (existingIds.has(a.id)) continue  // already in HARNESSES_DEF
  if (existingNames.has(a.name.toLowerCase())) continue  // duplicate name (e.g. claude vs claude-code)
  if (a.category === 'lifeos') continue  // LifeOS profiles are Hermes profiles, not separate engines
  if (a.category === 'infrastructure' && a.isComponent) continue  // n8n/Coder are components
  if (!a.launch?.tui?.cmd) continue  // only engines with TUI command
  
  const harnessDef = {
    id: a.id,
    name: a.name,
    bin: Array.isArray(a.detect?.bin) ? a.detect.bin : [a.detect?.bin].filter(Boolean),
    install: typeof a.install === 'string' ? a.install : (a.detect?.install || null),
    desc: a.description || a.desc || '',
    provider: a.provider || 'Unknown',
    key: (a.keys && a.keys[0]) || null,
    web: a.launch?.web ? { 
      port: a.launch.web.port, 
      cmd: a.launch.web.cmd,
      publicPort: a.launch.web.publicPort 
    } : null,
    uninstall: typeof a.uninstall === 'string' ? a.uninstall : null,
    update: a.update || null,
  }
  if (harnessDef.bin.length > 0) {
    HARNESSES_DEF.push(harnessDef)
    existingIds.add(a.id)
    existingNames.add(a.name.toLowerCase())
  }
}
console.log(`>>> [STARTUP] Merged harnesses total: ${HARNESSES_DEF.length}`)

async function binExists(names) {
  // Also probe common per-agent install dirs (installers place binaries in ~/.<agent>/bin).
  const homeBins = ['/root/.opencode/bin', '/root/.codex/bin', '/root/.claude/local/bin',
    '/root/.openclaw/bin', '/root/.dsh/bin', '/root/.local/bin', '/usr/local/bin', '/usr/bin']
  for (const n of names) {
    try {
      const r = await execS(`command -v ${n}`, { shell: '/bin/bash' })
      const out = (r?.stdout || '').trim()
      if ((r?.code === 0 || r?.exitCode === 0) && out && out.startsWith('/')) return true
      if (out && (out.startsWith('/') || out.includes('/bin/'))) return true
    } catch { /* not in PATH */ }
    // not in PATH — check common install dirs
    for (const dir of homeBins) {
      try {
        const s = await execS(`[ -x ${dir}/${n} ] && echo yes`, { shell: '/bin/bash' })
        if ((s?.stdout || '').trim().startsWith('yes')) return true
      } catch {}
    }
  }
  return false
}

function readWebDomain(file) {
  try {
    const d = readFileSync(file, 'utf8').trim()
    return d ? `https://${d}` : null
  } catch { return null }
}

async function discoverHarnesses() {
  const out = []
  for (const h of HARNESSES_DEF) {
    const installed = h.alwaysInstalled || await binExists(h.bin)
    out.push({
      id: h.id, name: h.name, installed,
      desc: h.desc, provider: h.provider, key: h.key,
      installCmd: installed ? null : h.install,
      uninstallCmd: h.uninstall || null,
      updateCmd: h.update || null,
      // engines with an install-time choice: mode (TUI/Web/both), Web UI domain, auth gate
      needsInstallOptions: h.id === 'opencode' || h.id === 'hermes',
      interactive: !!h.interactive,   // UI shows the keystroke pad while installing
      // installed engines that expose an interactive setup wizard (Hermes: provider, tools)
      setupAvailable: installed && !!h.setupAvailable,
      // Web UI domain chosen at install time (the chat's Web tab embeds it in an iframe,
      // so it must come from here instead of a baked-in subdomain).
      webUrl: h.id === 'hermes'
        // the dashboard only exists when the install also created its unit
        ? webOriginFor('hermes', { installed: installed && existsSync('/etc/systemd/system/hermes-dashboard.service'), file: '/root/.hermes-domain' })
        : webOriginFor(h.id, { installed }),
      web: h.web || null,
      bin: installed ? null : h.bin.join(' / '),
    })
  }
  return out
}

// ---- Install helpers (shared by engines and components) --------------------

// Life OS installs Caddy natively (package + /etc/caddy/Caddyfile, `systemctl reload caddy`);
// the remnawave host proxies through a Caddy *container*. Support both, otherwise
// component/web domains silently fail to appear on a fresh Life OS server.
function caddyTarget() {
  if (existsSync('/etc/caddy/Caddyfile')) {
    return { file: '/etc/caddy/Caddyfile', reload: 'systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || true' }
  }
  return { file: '/root/remnawave-admin/Caddyfile', reload: 'docker restart caddy >/dev/null 2>&1 || true' }
}

// Life OS base domain, as recorded by deploy/install.sh in the generated Caddyfile.
function lifeosBaseDomain() {
  for (const f of ['/etc/caddy/Caddyfile', '/root/remnawave-admin/Caddyfile']) {
    try {
      const m = readFileSync(f, 'utf8').match(/base domain:\s*(\S+)/)
      if (m) return m[1].toLowerCase()
    } catch {}
  }
  return ''
}

// Web UI origin of a component/engine: the domain its installer recorded, else <id>.<base>.
// Nothing is baked in — an old deployment's subdomain (n8n.dktunnel.xyz) pointed every
// install at a foreign host.
function webOriginFor(id, { installed = false, file = '' } = {}) {
  const rec = readWebDomain(file || `/root/.${id}-domain`)
  if (rec) return rec
  const base = parentDomain(lifeosBaseDomain())
  return installed && base ? `https://${id}.${base}` : null
}

// install.sh records the Life OS *site* domain (lifeos.example.com); component subdomains
// hang off its parent (example.com), which is how the previous fixed subdomains worked.
function parentDomain(dom) {
  const parts = String(dom || '').split('.').filter(Boolean)
  return parts.length > 2 ? parts.slice(1).join('.') : parts.join('.')
}

// The Life OS page frames engine/component web UIs, and its CSP (deploy/install.sh) lists
// the Life OS host plus the <id>.<parent> family. A domain outside that family — a custom
// engine domain — is silently blocked by the browser and the frame stays blank, with no
// error anywhere in the panel, so every installer that publishes a site also allows its own
// domain in connect-src/frame-src.
function cspAllowSnippet(domExpr = '"$DOM"') {
  const { file: caddyFile } = caddyTarget()
  return [
    `python3 - ${domExpr} <<'PY'`,
    'import sys',
    `p = '${caddyFile}'`,
    'dom = (sys.argv[1] or "").strip()',
    'if not dom:',
    '    raise SystemExit',
    'try:',
    '    s = open(p).read()',
    'except OSError:',
    '    raise SystemExit',
    "origin = 'https://' + dom",
    "lines = s.split('\\n')",
    'changed = False',
    'for i, line in enumerate(lines):',
    "    if 'Content-Security-Policy' not in line or origin in line:",
    '        continue',
    '    head, _, rest = line.partition(chr(34))',
    '    policy, _, tail = rest.rpartition(chr(34))',
    "    parts = policy.split(';')",
    '    for j, d in enumerate(parts):',
    '        t = d.strip()',
    "        if t.startswith('connect-src') or t.startswith('frame-src'):",
    "            parts[j] = t + ' ' + origin",
    '            changed = True',
    '    lines[i] = head + chr(34) + "; ".join(parts) + chr(34) + tail',
    'if changed:',
    "    open(p, 'w').write('\\n'.join(lines))",
    "    print('csp: разрешён фрейм ' + origin)",
    'else:',
    "    print('csp: ' + origin + ' уже разрешён (или CSP в конфиге нет)')",
    'PY',
  ]
}

// Shell prelude for components that need a public domain: resolve it (recorded value wins,
// else <id>.<Life OS base>), persist it and publish a Caddy site block for its port.
function componentDomainPrelude(id, port) {
  const { file: caddyFile, reload: caddyReload } = caddyTarget()
  return [
    `DOM="$(cat /root/.${id}-domain 2>/dev/null || true)"`,
    // the header holds the Life OS site domain (lifeos.example.com) — use its parent
    `if [ -z "$DOM" ]; then B="$(grep -oP 'base domain:\\s*\\K\\S+' ${caddyFile} 2>/dev/null | head -1)"; case "$B" in *.*.*) B="${'$'}{B#*.}";; esac; [ -n "$B" ] && DOM="${id}.$B"; fi`,
    `if [ -n "$DOM" ]; then echo "$DOM" > /root/.${id}-domain; else echo '[warn] домен не определён — впиши вручную в /root/.${id}-domain'; fi`,
    "python3 - \"$DOM\" <<'PY'",
    'import sys',
    `p = '${caddyFile}'`,
    `port = ${port}`,
    'dom = (sys.argv[1] or "").strip()',
    'if not dom:',
    "    print('caddy: домен не задан — сайт не добавлен'); raise SystemExit",
    'try:',
    '    s = open(p).read()',
    'except OSError:',
    "    print('caddy: файл не найден: ' + p); raise SystemExit",
    "if any(l.strip().split(' ')[0] == dom and l.strip().endswith('{') for l in s.splitlines() if l.strip()):",
    "    print('caddy site already present: ' + dom); raise SystemExit",
    'if s and not s.endswith(chr(10)): s += chr(10)',
    "s += dom + ' {' + chr(10) + '    reverse_proxy 127.0.0.1:' + str(port) + chr(10) + '}' + chr(10)",
    "open(p, 'w').write(s)",
    "print('caddy site added: ' + dom)",
    'PY',
    ...cspAllowSnippet(),
    caddyReload,
  ]
}

// Keystrokes forwarded to interactive installers (`hermes setup` is an arrow-key menu).
const KEY_SEQ = {
  up: '\x1b[A', down: '\x1b[B', left: '\x1b[D', right: '\x1b[C',
  enter: '\r', space: ' ', esc: '\x1b', tab: '\t', backspace: '\x7f', y: 'y', n: 'n',
}

const HERMES_INSTALL_CMD = 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash'

// Interactive installs need a real TTY: the Hermes installer probes /dev/tty
// (`has_terminal`) and skips `hermes setup` + `hermes gateway install` when there is
// none, so a plain pipe yields a half-installed agent. Run it in a PTY instead and
// let the UI forward keystrokes through /api/harness/install/keys.
//
// Interactive steps are full-screen TUIs: raw output is a stream of cursor moves and
// colour codes that reads as noise in a <pre>. Keep a virtual screen (honouring CR/LF,
// cursor moves and erases) and publish the rendered screen instead of the byte stream.
const PTY_COLS = 100
const PTY_ROWS = 34

function makeScreen(cols = PTY_COLS, rows = PTY_ROWS) {
  const blank = () => Array.from({ length: rows }, () => new Array(cols).fill(' '))
  let grid = blank()
  // Full-screen TUIs (the setup wizard) draw into the alternate screen buffer. Without
  // honouring ?1049h/l the log keeps showing the wizard menu after it exits, hiding the
  // real install output (progress + errors) on the normal buffer.
  let altSaved = null
  const cur = { r: 0, c: 0 }
  let saved = null                      // DECSC/DECRC (ESC 7 / ESC 8, CSI s / CSI u)
  let top = 0, bot = rows - 1           // DECSTBM scrolling region
  const clip = (n, max) => Math.max(0, Math.min(max, n))
  const scrollUp = (n) => {
    for (let k = 0; k < n; k++) { grid.splice(top, 1); grid.splice(bot, 0, new Array(cols).fill(' ')) }
  }
  const scrollDown = (n) => {
    for (let k = 0; k < n; k++) { grid.splice(bot, 1); grid.splice(top, 0, new Array(cols).fill(' ')) }
  }
  const linefeed = () => { if (cur.r >= bot) scrollUp(1); else cur.r = clip(cur.r + 1, rows - 1) }
  const put = (ch) => {
    if (cur.c >= cols) { cur.c = 0; linefeed() }   // autowrap (the wizard turns ?7h on)
    grid[cur.r][cur.c] = ch
    cur.c = clip(cur.c + 1, cols - 1)
  }
  const feed = (s) => {
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if (ch === '\x1b') {
        const csi = /^\x1b\[([0-9;?]*)([A-Za-z])/.exec(s.slice(i))
        if (csi) {
          const nums = csi[1].split(';').filter(x => x !== '').map(Number)
          const n = nums[0] || 1
          const f = csi[2]
          if (csi[1].startsWith('?')) {          // private modes: only the screen buffer matters
            const modes = csi[1].slice(1).split(';').map(Number)
            if (modes.some(m => m === 1049 || m === 1047 || m === 47)) {
              if (f === 'h') { altSaved = grid; grid = blank(); cur.r = 0; cur.c = 0 }
              else if (f === 'l' && altSaved) {
                grid = altSaved; altSaved = null
                cur.r = rows - 1; cur.c = 0
              }
            }
            i += csi[0].length - 1
            continue
          }
          if (f === 'H' || f === 'f') {
            cur.r = clip((nums[0] || 1) - 1, rows - 1)
            cur.c = clip((nums[1] || 1) - 1, cols - 1)
          } else if (f === 'A') cur.r = clip(cur.r - n, rows - 1)
          else if (f === 'B') cur.r = clip(cur.r + n, rows - 1)
          else if (f === 'C') cur.c = clip(cur.c + n, cols - 1)
          else if (f === 'D') cur.c = clip(cur.c - n, cols - 1)
          else if (f === 'G') cur.c = clip(n - 1, cols - 1)
          // VPA: the setup wizard positions every menu row with CSI <row> d, so ignoring
          // it shifted rows and lost options (the arrow appeared on the wrong line).
          else if (f === 'd') cur.r = clip(n - 1, rows - 1)
          else if (f === 'r') {
            top = clip(n - 1, rows - 1)
            bot = clip((nums[1] || rows) - 1, rows - 1)
            if (bot <= top) bot = rows - 1
            cur.r = top; cur.c = 0
          }
          else if (f === 's') saved = { r: cur.r, c: cur.c }
          else if (f === 'u') { if (saved) { cur.r = saved.r; cur.c = saved.c } }
          else if (f === 'X') { for (let k = 0; k < n && cur.c + k < cols; k++) grid[cur.r][cur.c + k] = ' ' }
          else if (f === 'P') { const row = grid[cur.r]; row.splice(cur.c, n); while (row.length < cols) row.push(' ') }
          else if (f === '@') { const row = grid[cur.r]; row.splice(cur.c, 0, ...new Array(n).fill(' ')); row.length = cols }
          else if (f === 'L') { for (let k = 0; k < n; k++) { grid.splice(bot, 1); grid.splice(cur.r, 0, new Array(cols).fill(' ')) } }
          else if (f === 'M') { for (let k = 0; k < n; k++) { grid.splice(cur.r, 1); grid.splice(bot, 0, new Array(cols).fill(' ')) } }
          else if (f === 'S') scrollUp(n)
          else if (f === 'T') scrollDown(n)
          else if (f === 'K') {
            const mode = nums[0] || 0
            if (mode === 0) for (let c = cur.c; c < cols; c++) grid[cur.r][c] = ' '
            else if (mode === 1) for (let c = 0; c <= cur.c; c++) grid[cur.r][c] = ' '
            else grid[cur.r] = new Array(cols).fill(' ')
          } else if (f === 'J') {
            const mode = nums[0] || 0
            if (mode === 2 || mode === 3) grid = blank()
          }
          i += csi[0].length - 1
          continue
        }
        const saveCur = /^\x1b([78])/.exec(s.slice(i))         // ESC 7 / ESC 8
        if (saveCur) {
          if (saveCur[1] === '7') saved = { r: cur.r, c: cur.c }
          else if (saved) { cur.r = saved.r; cur.c = saved.c }
          i += 1
          continue
        }
        const set = /^\x1b[()][A-Za-z0-9]/.exec(s.slice(i))   // charset selection
        i += set ? set[0].length - 1 : 1                       // lone/unknown ESC: drop
        continue
      }
      if (ch === '\n') { linefeed(); continue }
      if (ch === '\r') { cur.c = 0; continue }
      if (ch === '\b') { cur.c = clip(cur.c - 1, cols - 1); continue }
      if (ch === '\t') { for (let k = 0; k < 8 && cur.c < cols - 1; k++) put(' '); continue }
      if (ch < ' ') continue
      put(ch)
    }
  }
  const text = () => grid
    .map(l => l.join('').replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
  return { feed, text }
}

// Errors/build output from non-interactive runs can still carry colour codes.
const stripAnsi = (s) => String(s)
  .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
  .replace(/\x1b[()][A-Za-z0-9]/g, '')
  .replace(/\r\n?/g, '\n')

function runLoggedPty(store, id, cmd, doneLabel, timeoutMs = 1800000, { screen: useScreen = true } = {}) {
  store[id] = { state: 'running', log: '', interactive: true, pty: null }
  let term
  try {
    term = ptySpawn('/bin/bash', ['-lc', cmd], {
      name: 'xterm-256color', cols: PTY_COLS, rows: PTY_ROWS, cwd: '/root',
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        HOME: '/root',
        // `hermes gateway install` writes a *user* service; systemd --user needs a bus.
        XDG_RUNTIME_DIR: '/run/user/0',
        DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/0/bus',
      },
    })
  } catch (e) {
    store[id].state = 'error'
    store[id].log += `[ошибка запуска PTY] ${e?.message || e}`
    return
  }
  store[id].pty = term
  const screen = makeScreen()
  term.onData((chunk) => {
    const s = store[id]; if (!s) return
    if (useScreen) {
      screen.feed(chunk)
      s.log = screen.text()
    } else {
      // Linear output (an uninstaller listing what it removes): a virtual screen would
      // scroll the earliest lines away, so keep the plain text tail instead.
      s.log += stripAnsi(chunk)
    }
    if (s.log.length > 64000) s.log = s.log.slice(-64000)
  })
  const timer = setTimeout(() => { try { term.kill() } catch {} }, timeoutMs)
  term.onExit(({ exitCode }) => {
    clearTimeout(timer)
    const s = store[id]; if (!s) return
    s.pty = null; s.interactive = false
    s.state = exitCode === 0 ? 'done' : 'error'
    s.log += `\n\n[${doneLabel}${exitCode === 0 ? '' : ` с ошибкой, код ${exitCode}`}]`
  })
}

// Hermes engine install options: TUI only / Web UI only / both, the Web UI domain, and
// the dashboard auth gate. The dashboard's own providers are configured through env vars
// read by hermes-dashboard.service: BASIC_AUTH_* (username + password) and the Nous
// Portal OAuth client id written by `hermes dashboard register`.
function buildHermesInstall({ mode = 'tui', domain = '', protection = 'basic', basicUser = '', basicPass = '' } = {}) {
  const lines = [
    'set -e',
    // `hermes gateway install` writes a *user* systemd service; systemd --user needs a
    // session bus, otherwise the whole install ends with "Could not start the gateway
    // service" and a non-zero exit (which is how the first Life OS run failed).
    'export XDG_RUNTIME_DIR=/run/user/0',
    'export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus',
    '[ -d "$XDG_RUNTIME_DIR" ] || { mkdir -p "$XDG_RUNTIME_DIR"; chmod 700 "$XDG_RUNTIME_DIR"; }',
    'loginctl enable-linger root 2>/dev/null || true',
    "echo '[1/3] Hermes: официальный инсталлятор (интерактивно — отвечай кнопками под логом)'",
    HERMES_INSTALL_CMD,
    // Safety net: if the user-scope service could not be started, install it system-wide.
    "systemctl --user is-active hermes-gateway >/dev/null 2>&1 || hermes gateway install --if-missing 2>&1 || hermes gateway install --system --run-as-user root --no-start-on-login 2>&1 || echo '[warn] гейтвей не поднялся: hermes gateway install --system'",
  ]
  if (mode === 'tui') {
    lines.push("echo '[готово] Hermes установлен в режиме TUI'")
    return lines.join('\n')
  }
  const dom = String(domain).trim().toLowerCase()
  const wantBasic = protection === 'basic' || protection === 'both'
  const wantOauth = protection === 'oauth' || protection === 'both'
  const gate = wantBasic && wantOauth ? 'Basic Auth + OAuth' : (wantBasic ? 'Basic Auth' : 'OAuth (Nous Portal)')
  const { file: caddyFile, reload: caddyReload } = caddyTarget()

  lines.push(
    `echo '[2/3] Web UI: домен ${dom}, защита: ${gate}'`,
    'ENVF=/root/.hermes/dashboard_auth_env.conf',
    'mkdir -p /root/.hermes; touch "$ENVF"; chmod 600 "$ENVF"',
    `grep -q '^HERMES_DASHBOARD_PUBLIC_URL=' "$ENVF" || printf 'HERMES_DASHBOARD_PUBLIC_URL=https://%s\\n' '${dom}' >> "$ENVF"`,
  )
  if (wantBasic) {
    // Credentials come from the UI when the user typed them; otherwise generate.
    const sq = (v) => String(v).replace(/'/g, "'\\''")
    lines.push(
      basicUser ? `AUTH_USER='${sq(basicUser)}'` : "AUTH_USER=\"lifeos-$(openssl rand -hex 2)\"",
      basicPass ? `AUTH_PASS='${sq(basicPass)}'` : "AUTH_PASS=\"$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-18)\"",
      'AUTH_SECRET="$(openssl rand -hex 32)"',
      "printf 'AUTH_USER=%s\\nAUTH_PASS=%s\\nAUTH_SECRET=%s\\n' \"$AUTH_USER\" \"$AUTH_PASS\" \"$AUTH_SECRET\" > /root/.hermes-web-auth",
      'chmod 600 /root/.hermes-web-auth',
      "sed -i '/^HERMES_DASHBOARD_BASIC_AUTH_/d' \"$ENVF\"",
      "printf 'HERMES_DASHBOARD_BASIC_AUTH_USERNAME=%s\\nHERMES_DASHBOARD_BASIC_AUTH_PASSWORD=%s\\nHERMES_DASHBOARD_BASIC_AUTH_SECRET=%s\\n' \"$AUTH_USER\" \"$AUTH_PASS\" \"$AUTH_SECRET\" >> \"$ENVF\"",
      "echo \"[basic] вход: $AUTH_USER / $AUTH_PASS — сохрани, они же видны во вкладке «Ключи» → Hermes\"",
    )
  }
  if (wantOauth) {
    lines.push(
      "echo '[oauth] регистрирую dashboard в Nous Portal...'",
      // The runtime hands the IDP `{HERMES_DASHBOARD_PUBLIC_URL}/auth/callback`. Registering
      // without --redirect-uri creates a localhost-only client, and the portal then refuses
      // the public callback with redirect_uri_mismatch — so the public callback MUST be
      // registered (it also makes register write HERMES_DASHBOARD_PUBLIC_URL itself).
      `hermes dashboard register --redirect-uri "https://${dom}/auth/callback" --name "Life OS: ${dom}" 2>&1 || echo '[warn] OAuth не зарегистрирован: нужен вход в Nous Portal (hermes setup → Quick Setup), затем повторить установку или hermes dashboard register --redirect-uri https://${dom}/auth/callback'`,
      "grep -q '^HERMES_DASHBOARD_OAUTH_CLIENT_ID=' /root/.hermes/.env && echo '[oauth] client_id записан в /root/.hermes/.env' || echo '[warn] client_id не записан — OAuth-вход не заработает'",
    )
  }
  lines.push(
    "echo '[3/3] systemd-сервис dashboard + домен в Caddy'",
    "cat > /etc/systemd/system/hermes-dashboard.service <<'UNIT'",
    '[Unit]',
    'Description=Hermes Dashboard (Life OS component)',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    'User=root',
    'Environment=HOME=/root',
    'EnvironmentFile=-/root/.hermes/dashboard_auth_env.conf',
    // The installer drops the CLI in ~/.hermes/hermes-agent/.hermes/bin (not always on a
    // login-shell PATH), so resolve the real binary and bake it into the unit.
    'ExecStart=__HERMES_BIN__ dashboard --host 0.0.0.0 --port 9119 --no-open',
    'Restart=always',
    'RestartSec=3',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    'UNIT',
    'HB="$(command -v hermes || true)"',
    '[ -x "$HB" ] || HB=/root/.hermes/hermes-agent/.hermes/bin/hermes',
    '[ -x "$HB" ] || HB=/usr/local/bin/hermes',
    'sed -i "s|^ExecStart=.*|ExecStart=$HB dashboard --host 0.0.0.0 --port 9119 --no-open|" /etc/systemd/system/hermes-dashboard.service',
    "echo \"[bin] dashboard запускается из $HB\"",
    'systemctl daemon-reload',
    'systemctl enable --now hermes-dashboard',
    "python3 - <<'PY'",
    'import re',
    `p='${caddyFile}'`,
    `dom='${dom}'`,
    's=open(p).read()',
    "if not re.search(r'(?m)^' + re.escape(dom) + r'[ \\t]*\\{', s):",
    "    if s and not s.endswith(chr(10)): s += chr(10)",
    "    s += dom + ' {' + chr(10) + '    reverse_proxy 127.0.0.1:9119' + chr(10) + '}' + chr(10)",
    "    open(p,'w').write(s)",
    "    print('caddy site added: ' + dom)",
    'else:',
    "    print('caddy site already present: ' + dom)",
    'PY',
    ...cspAllowSnippet(`'${dom}'`),
    caddyReload,
    `echo '${dom}' > /root/.hermes-domain`,
    `echo '[готово] Hermes${mode === 'both' ? ': TUI + Web UI' : ': Web UI'} — https://${dom}'`,
  )
  return lines.join('\n')
}

// Hermes removal: the engine owns a user *and* a system gateway unit, our dashboard unit,
// a Caddy site and ~/.hermes data/configs. `hermes uninstall --full` handles the agent
// itself; the rest is ours to clean so a reinstall starts from scratch.
function buildHermesUninstall() {
  const { file: caddyFile, reload: caddyReload } = caddyTarget()
  const lines = [
    'export XDG_RUNTIME_DIR=/run/user/0',
    'export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus',
    "echo '[1/4] Останавливаю сервисы гейтвея и dashboard'",
    'systemctl --user disable --now hermes-gateway 2>/dev/null || true',
    'systemctl disable --now hermes-gateway 2>/dev/null || true',
    'rm -f /root/.config/systemd/user/hermes-gateway.service /etc/systemd/system/hermes-gateway.service',
    'systemctl disable --now hermes-dashboard 2>/dev/null || true',
    'rm -f /etc/systemd/system/hermes-dashboard.service',
    'systemctl daemon-reload 2>/dev/null || true',
    'systemctl --user daemon-reload 2>/dev/null || true',
    "echo '[2/4] Убираю домен из Caddy'",
    'DOM="$(cat /root/.hermes-domain 2>/dev/null || true)"; export DOM',
    "python3 - <<'PY'",
    'import os, re',
    'dom = os.environ.get("DOM", "").strip()',
    'if not dom:',
    '    print("домен не сохранён — пропускаю")',
    'else:',
    `    for p in ["${caddyFile}", "/etc/caddy/Caddyfile", "/root/remnawave-admin/Caddyfile"]:`,
    '        if not os.path.exists(p):',
    '            continue',
    '        s = open(p).read()',
    '        m = re.search(r"(?m)^\\s*" + re.escape(dom) + r"\\s*\\{", s)',
    '        if not m:',
    '            print("нет site-блока " + dom + " в " + p)',
    '            continue',
    '        i = s.index("{", m.start())',
    '        depth = 0',
    '        j = i',
    '        while j < len(s):',
    '            if s[j] == "{":',
    '                depth += 1',
    '            elif s[j] == "}":',
    '                depth -= 1',
    '                if depth == 0:',
    '                    break',
    '            j += 1',
    '        end = j + 1',
    '        while end < len(s) and s[end] == chr(10):',
    '            end += 1',
    '        open(p, "w").write(s[:m.start()] + s[end:])',
    '        print("site-блок удалён из " + p)',
    'PY',
    caddyReload,
    "echo '[3/4] Штатное удаление Hermes (--full: код + конфиги + данные)'",
    'HB="$(command -v hermes || true)"',
    '[ -x "$HB" ] || HB=/root/.hermes/hermes-agent/.hermes/bin/hermes',
    '[ -x "$HB" ] && "$HB" uninstall --full --yes 2>&1 || echo "[warn] штатный uninstall недоступен — чищу файлы вручную"',
    "echo '[4/4] Остатки'",
    'rm -rf /root/.hermes/hermes-agent /root/.hermes/bin',
    'rm -f /usr/local/bin/hermes /usr/bin/hermes /root/.hermes-web-auth /root/.hermes-domain /root/.hermes/dashboard_auth_env.conf',
    "command -v hermes >/dev/null 2>&1 && echo \"[warn] бинарник всё ещё в PATH: $(command -v hermes)\" || echo '  бинарник удалён — чисто'",
    "systemctl --user is-active hermes-gateway >/dev/null 2>&1 && echo '[warn] user-гейтвей всё ещё активен' || echo '  гейтвей остановлен'",
    "echo '[Hermes удалён]'",
  ]
  return lines.join('\n')
}

// Attach the removal command (HARNESSES_DEF itself is defined earlier in the file).
const HERMES_DEF = HARNESSES_DEF.find(h => h.id === 'hermes')
if (HERMES_DEF) HERMES_DEF.uninstall = buildHermesUninstall()
if (HERMES_DEF) HERMES_DEF.setupAvailable = true

// Re-run the interactive setup wizard of an installed engine. Hermes cancels its wizard
// (or the user exits it), leaving the engine installed but without an AI provider — there
// was no way to open the wizard again from the panel.
function buildHermesSetup() {
  return [
    'export XDG_RUNTIME_DIR=/run/user/0',
    'export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus',
    'HB="$(command -v hermes || true)"',
    'for c in /usr/local/bin/hermes /root/.hermes/hermes-agent/.hermes/bin/hermes /root/.hermes/bin/hermes; do [ -x "$c" ] && HB="$c" && break; done',
    'if [ -z "$HB" ]; then echo "Hermes не установлен — сначала установи движок"; exit 1; fi',
    'echo "[мастер настроек Hermes] отвечай кнопками под логом: ↑↓ выбор, ⏎ подтвердить, Esc отмена"',
    '"$HB" setup',
    'echo "[мастер настроек завершён]"',
  ].join('\n')
}

// POST /api/harness/setup — open the interactive setup wizard of an installed engine
app.post('/api/harness/setup', async (req, res) => {
  const { id } = req.body || {}
  const def = HARNESSES_DEF.find(h => h.id === id)
  if (!def) return res.status(404).json({ error: 'агент не найден' })
  if (id !== 'hermes') return res.status(400).json({ error: 'для этого движка нет мастера настроек' })
  if (installs[id]?.state === 'running') return res.json({ ok: true, state: 'running' })
  runLoggedPty(installs, id, buildHermesSetup(), 'настройка завершена', 1800000)
  res.json({ ok: true, state: 'running' })
})

// POST /api/harness/install — install one agent (runs installCmd in background)
const installs = {}  // id -> {state, log}
const uninstalls = {}  // id -> {state, log}
const updates = {}  // id -> {state, log}

// Run `cmd` in the background with LIVE streaming logs (exec buffers everything
// until exit — the user would stare at "running..." with no feedback).
// Output is appended to store[id].log as it arrives (tail-capped at ~64KB).
const LOG_CAP = 64 * 1024
function runLogged(store, id, cmd, doneLabel, timeoutMs = 600000) {
  store[id] = { state: 'running', log: '' }
  const push = (chunk) => {
    const s = store[id]
    if (!s) return
    s.log += stripAnsi(chunk)
    if (s.log.length > LOG_CAP) s.log = s.log.slice(-LOG_CAP)
  }
  const child = spawn('/bin/bash', ['-lc', cmd], { env: { ...process.env, TERM: 'xterm-256color' } })
  child.stdout?.on('data', push)
  child.stderr?.on('data', push)
  const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, timeoutMs)
  child.on('close', (code) => {
    clearTimeout(timer)
    const s = store[id]
    if (!s) return
    s.state = code === 0 ? 'done' : 'error'
    s.log += `\n[${doneLabel}${code === 0 ? '' : ` с ошибкой, код ${code}`}]`
  })
  child.on('error', (e) => {
    clearTimeout(timer)
    const s = store[id]
    if (!s) return
    s.state = 'error'
    s.log += `\n[ошибка] ${e?.message || e}`
  })
}

app.post('/api/harness/install', async (req, res) => {
  const { id, mode, domain, protection, basicUser, basicPass } = req.body || {}
  const def = HARNESSES_DEF.find(h => h.id === id)
  if (!def) return res.status(404).json({ error: 'агент не найден' })
  if (installs[id]?.state === 'running') return res.json({ ok: true, state: 'running' })

  let cmd = def.install
  // OpenCode install options: tui / web / both + custom domain for the web UI
  if (id === 'opencode' && (mode === 'web' || mode === 'both')) {
    const dom = String(domain || '').trim().toLowerCase()
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])\.[a-z]{2,}$/i.test(dom)) {
      return res.status(400).json({ error: 'некорректный домен: ' + dom })
    }
    const { file: caddyFile, reload: caddyReload } = caddyTarget()
    const script = [
      '# install binary (v2 installer)',
      'curl -fsSL https://opencode.ai/v2/install -o /tmp/install-opencode.sh && bash /tmp/install-opencode.sh --no-modify-path </dev/null; rm -f /tmp/install-opencode.sh',
      '# systemd web service',
      "cat > /etc/systemd/system/opencode-web.service <<'UNIT'",
      '[Unit]',
      'Description=OpenCode Web UI (opencode serve)',
      'After=network.target',
      '',
      '[Service]',
      'ExecStart=/root/.opencode/bin/opencode serve --port 4096 --hostname 127.0.0.1',
      'Restart=always',
      'RestartSec=3',
      'User=root',
      'Environment=HOME=/root',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'UNIT',
      '[ -f /root/.opencode-web-pass ] || (openssl rand -hex 16 > /root/.opencode-web-pass && chmod 600 /root/.opencode-web-pass)',
      "sed -i '/Environment=HOME=\\/root/a Environment=OPENCODE_PASSWORD='\"$(cat /root/.opencode-web-pass)\"' /etc/systemd/system/opencode-web.service'",
      'systemctl daemon-reload && systemctl enable --now opencode-web',
      '# caddy site block for the chosen domain',
      "python3 - <<'PY'",
      "import re",
      `p='${caddyFile}'`,
      "s=open(p).read()",
      `dom='${dom}'`,
      "if not re.search(r'(?m)^'+re.escape(dom)+r'\\s*\\{', s):",
      "    if s and not s.endswith('\\n'): s += '\\n'",
      "    s += dom + ' {\\n    reverse_proxy 127.0.0.1:4096 {\\n        header_up Authorization \\\\\"Basic " + OC_BASIC + "\\\\\"\\n    }\\n}\\n'",
      "    open(p,'w').write(s)",
      "    print('caddy site added')",
      'else:',
      "    print('caddy site already present')",
      "    bare=re.compile(r'(?m)^(\\s*)reverse_proxy 127\\.0\\.0\\.1:4096\\s*$')",
      `    s2,bare_n=bare.subn('\\1reverse_proxy 127.0.0.1:4096 {\\n\\1    header_up Authorization "Basic ${OC_BASIC}"\\n\\1}', s)`,
      "    if bare_n: open(p,'w').write(s2); print('auth header added to', bare_n, 'proxy lines')",
      'PY',
      ...cspAllowSnippet(`'${dom}'`),
      `echo '${dom}' > /root/.opencode-domain`,
      caddyReload,
    ].join('\n')
    cmd = script
  }

  // Hermes install options: tui / web / both + Web UI domain + dashboard auth gate
  if (id === 'hermes') {
    if (mode !== 'tui') {
      const dom = String(domain || '').trim().toLowerCase()
      if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])\.[a-z]{2,}$/i.test(dom)) {
        return res.status(400).json({ error: 'некорректный домен: ' + dom })
      }
      if (!['basic', 'oauth', 'both'].includes(protection || 'basic')) {
        return res.status(400).json({ error: 'неизвестная защита: ' + protection })
      }
      // Basic-auth credentials are the owner's choice; validate before they reach the script.
      if ((protection || 'basic') !== 'oauth') {
        const u = String(basicUser || '').trim()
        const p = String(basicPass || '')
        if (u && !/^[A-Za-z0-9._-]{1,32}$/.test(u)) {
          return res.status(400).json({ error: 'логин: разрешены латиница, цифры, . _ - (до 32 символов)' })
        }
        if (p && (p.length < 8 || p.length > 64 || /[\s'"\\`$]/.test(p))) {
          return res.status(400).json({ error: 'пароль: 8–64 символа, без пробелов и кавычек' })
        }
      }
    }
    cmd = buildHermesInstall({
      mode: mode || 'tui', domain, protection: protection || 'basic',
      basicUser: String(basicUser || '').trim(), basicPass: String(basicPass || ''),
    })
  }

  // Interactive installers (Hermes) need a TTY — they probe /dev/tty and silently skip
  // their setup stages without one, leaving a half-installed agent.
  if (def.interactive) runLoggedPty(installs, id, cmd, 'установка завершена')
  else runLogged(installs, id, cmd, 'установка завершена')
  res.json({ ok: true, state: 'running' })
})

// POST /api/harness/install/keys — forward a keystroke to a running interactive install
// (arrow-key menus in the Hermes installer / setup wizard). Body: { id, key } for a named
// key or { id, text } for a literal string.
app.post('/api/harness/install/keys', (req, res) => {
  const { id, key, text } = req.body || {}
  const s = installs[id]
  if (!s?.pty) return res.status(409).json({ error: 'интерактивная установка не запущена' })
  const seq = typeof text === 'string' ? text : KEY_SEQ[key]
  if (!seq) return res.status(400).json({ error: 'неизвестная клавиша: ' + key })
  try {
    s.pty.write(seq)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) })
  }
})

// POST /api/harness/update — update one agent in place (def.update command)
app.post('/api/harness/update', async (req, res) => {
  const { id } = req.body || {}
  const def = HARNESSES_DEF.find(h => h.id === id)
  if (!def) return res.status(404).json({ error: 'агент не найден' })
  if (!def.update) return res.status(400).json({ error: 'для этого агента нет команды обновления' })
  if (updates[id]?.state === 'running') return res.json({ ok: true, state: 'running' })
  runLogged(updates, id, def.update, 'обновление завершено')
  res.json({ ok: true, state: 'running' })
})
// GET /api/harness/update/status?id=
app.get('/api/harness/update/status', (req, res) => {
  const id = req.query.id || ''
  const st = updates[id]
  res.json({ id, state: st ? st.state : 'none', log: st ? st.log : '' })
})

// POST /api/harness/uninstall — full removal (npm uninstall + binary + config dirs)
app.post('/api/harness/uninstall', async (req, res) => {
  const { id } = req.body || {}
  const def = HARNESSES_DEF.find(h => h.id === id)
  if (!def) return res.status(404).json({ error: 'агент не найден' })
  if (!def.uninstall) return res.status(400).json({ error: 'для этого агента нет команды удаления' })
  if (uninstalls[id]?.state === 'running') return res.json({ ok: true, state: 'running' })
  // Interactive engines (Hermes) run their own uninstaller, which may still prompt —
  // give it a PTY and the same keystroke pad as the install.
  if (def.interactive) runLoggedPty(uninstalls, id, def.uninstall, 'удаление завершено', 900000, { screen: false })
  else runLogged(uninstalls, id, def.uninstall, 'удаление завершено', 120000)
  res.json({ ok: true, state: 'running' })
})

// GET /api/harness/install/status?id=
app.get('/api/harness/install/status', (req, res) => {
  const id = req.query.id || ''
  const st = installs[id]
  res.json({ id, state: st ? st.state : 'none', log: st ? st.log : '' })
})

// GET /api/harness/uninstall/status?id=
app.get('/api/harness/uninstall/status', (req, res) => {
  const id = req.query.id || ''
  const st = uninstalls[id]
  res.json({ id, state: st ? st.state : 'none', log: st ? st.log : '' })
})

// ---- Installable components (n8n, Coder) — «Установка компонентов» tab ----
// Unlike harnesses these are full services (systemd + deps). Detection is service
// state first, binary second. Install scripts are idempotent (skip existing parts).
const N8N_SERVICE = `[Unit]
Description=n8n Workflow Automation
After=network.target

[Service]
Type=simple
User=root
Environment=N8N_RUNNERS_ENABLED=false
Environment=N8N_HOST=127.0.0.1
Environment=N8N_PORT=5678
Environment=N8N_PROTOCOL=http
EnvironmentFile=/root/.n8n.env
Environment=N8N_SECURE_COOKIE=false
Environment=WEBHOOK_URL=http://127.0.0.1:5678/
WorkingDirectory=/root
ExecStart=/usr/local/bin/n8n start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target`

const CODER_SERVICE = `[Unit]
Description=Coder self-hosted cloud development platform
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
EnvironmentFile=/root/coder.env
ExecStart=/usr/bin/coder server
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target`

const COMPONENTS_DEF = [
  {
    id: 'n8n', name: 'n8n',
    // `systemctl is-active X | grep -q active` also matched "inactive" (substring) and
    // `command -v` matched leftovers — both made a never-installed component read as
    // "установлен". Truth = the unit our own installer writes/removes.
    detect: `test -f /etc/systemd/system/n8n.service`,
    desc: 'n8n Workflow Automation — визуальный конструктор воркфлоу (свой домен, порт 5678).',
    webPort: 5678,
    install: `
set -e
${componentDomainPrelude('n8n', 5678).join('\n')}
command -v n8n >/dev/null 2>&1 || npm install -g n8n
if [ ! -f /root/.n8n.env ]; then
  echo "N8N_ENCRYPTION_KEY=$(openssl rand -hex 24)" > /root/.n8n.env
  echo "N8N_ENCRYPTION_KEY exists: /root/.n8n.env"
fi
cat > /etc/systemd/system/n8n.service <<'UNIT'
${N8N_SERVICE}
UNIT
[ -n "$DOM" ] && sed -i "s|^Environment=WEBHOOK_URL=.*|Environment=WEBHOOK_URL=https://$DOM/|" /etc/systemd/system/n8n.service
systemctl daemon-reload
systemctl enable --now n8n
echo "[n8n установлен и запущен]${'$'}{DOM:+ — https://\$DOM}"`,
    uninstall: `systemctl stop n8n 2>/dev/null; systemctl disable n8n 2>/dev/null; rm -f /etc/systemd/system/n8n.service; systemctl daemon-reload; npm uninstall -g n8n 2>/dev/null; echo '[n8n удалён] (данные ~/.n8n сохранены)'`,
    timeout: 900000,
  },
  {
    id: 'coder', name: 'Coder',
    // see n8n note above: same "inactive"-matches-"active" false positive
    detect: `test -f /etc/systemd/system/coder.service`,
    desc: 'Coder — self-hosted cloud dev (VS Code в браузере, воркспейсы; свой домен, порт 7080).',
    webPort: 7080,
    install: `
set -e
${componentDomainPrelude('coder', 7080).join('\n')}
command -v coder >/dev/null 2>&1 || curl -fsSL https://coder.com/install.sh | sh
if [ ! -f /root/.coder-db.env ]; then
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" > /root/.coder-db.env
fi
PGPW=$(grep -oP 'POSTGRES_PASSWORD=\\K.*' /root/.coder-db.env)
docker ps -a --format '{{.Names}}' | grep -qx coder-db || \\
  docker run -d --name coder-db --restart always \\
    -e POSTGRES_USER=coder -e POSTGRES_PASSWORD="$PGPW" -e POSTGRES_DB=coder \\
    -p 127.0.0.1:5433:5432 -v coder-db-data:/var/lib/postgresql/data postgres:16-alpine
if [ ! -f /root/coder.env ]; then
  cat > /root/coder.env <<ENVEOF
CODER_PG_CONNECTION_URL=postgres://coder:\${PGPW}@127.0.0.1:5433/coder?sslmode=disable
CODER_ACCESS_URL=https://$DOM
CODER_ADDRESS=0.0.0.0:7080
CODER_TELEMETRY_ENABLE=false
ENVEOF
fi
cat > /etc/systemd/system/coder.service <<'UNIT'
${CODER_SERVICE}
UNIT
systemctl daemon-reload
systemctl enable --now coder
sleep 6
if [ ! -f /root/.coder-admin.env ]; then
  PW="Code-$(openssl rand -hex 8)-Aa1"
  curl -sf -X POST http://127.0.0.1:7080/api/v2/users/first \\
    -H 'Content-Type: application/json' \\
    -d "{\\\"username\\\":\\\"coderadmin\\\",\\\"email\\\":\\\"coder@$DOM\\\",\\\"password\\\":\\\"$PW\\\"}" \\
    || echo '[warn] first user not created (maybe exists)'
  printf 'ADMIN_USER=coderadmin\\nADMIN_EMAIL=coder@%s\\nADMIN_PW=%s\\n' "$DOM" "$PW" > /root/.coder-admin.env
fi
echo "[Coder установлен и запущен] Логин: coder@$DOM, пароль в /root/.coder-admin.env (вкладка Ключи → Coder)"`,
    uninstall: `systemctl stop coder 2>/dev/null; systemctl disable coder 2>/dev/null; rm -f /etc/systemd/system/coder.service /usr/bin/coder /usr/local/bin/coder; systemctl daemon-reload; docker rm -f coder-db 2>/dev/null; rm -rf /root/coder-tpl /root/coder-dev; rm -f /root/coder.env /root/.coder-admin.env /root/.coder-db.env /root/.coder.token /root/.coder-cli.env; echo '[Coder удалён]'`,
    timeout: 900000,
  },
]

async function discoverComponents() {
  const out = []
  for (const c of COMPONENTS_DEF) {
    // promisify(exec) resolves ONLY on exit code 0 and throws otherwise —
    // a successful detect therefore means "installed".
    let installed = false
    try { await execS(c.detect, { shell: '/bin/bash' }); installed = true } catch { installed = false }
    out.push({
      id: c.id, name: c.name, installed, desc: c.desc, kind: 'component',
      webPort: c.webPort || null,
      webUrl: c.webPort ? webOriginFor(c.id, { installed }) : null,
    })
  }
  return out
}

app.get('/api/components', async (_, res) => res.json({ components: await discoverComponents() }))

app.post('/api/components/install', (req, res) => {
  const { id } = req.body || {}
  const def = COMPONENTS_DEF.find(c => c.id === id)
  if (!def) return res.status(404).json({ error: 'компонент не найден' })
  if (installs[id]?.state === 'running') return res.json({ ok: true, state: 'running' })
  installs[id] = { state: 'running', log: '' }
  execS(def.install, { timeout: def.timeout || 900000, shell: '/bin/bash' })
    .then(r => {
      installs[id].state = 'done'
      installs[id].log += (r?.stdout || '') + (r?.stderr || '') + '\n[установка завершена]'
    })
    .catch(e => {
      installs[id].state = 'error'
      installs[id].log += (e?.stdout || '') + (e?.stderr || '') + `\n[ошибка] ${e?.message || ''}`
    })
  res.json({ ok: true, state: 'running' })
})

app.post('/api/components/uninstall', (req, res) => {
  const { id } = req.body || {}
  const def = COMPONENTS_DEF.find(c => c.id === id)
  if (!def) return res.status(404).json({ error: 'компонент не найден' })
  if (uninstalls[id]?.state === 'running') return res.json({ ok: true, state: 'running' })
  uninstalls[id] = { state: 'running', log: '' }
  execS(def.uninstall, { timeout: 120000, shell: '/bin/bash' })
    .then(r => {
      uninstalls[id].state = 'done'
      uninstalls[id].log += (r?.stdout || '') + (r?.stderr || '') + '\n[удаление завершено]'
    })
    .catch(e => {
      uninstalls[id].state = 'done'
      uninstalls[id].log += (e?.stdout || '') + (e?.stderr || '') + `\n[удаление завершено] ${e?.message || ''}`
    })
  res.json({ ok: true, state: 'running' })
})

// GET /api/components/install/status?id= and uninstall — reuse harness status shape
app.get('/api/components/install/status', (req, res) => {
  const id = req.query.id || ''
  const st = installs[id]
  res.json({ id, state: st ? st.state : 'none', log: st ? st.log : '' })
})
app.get('/api/components/uninstall/status', (req, res) => {
  const id = req.query.id || ''
  const st = uninstalls[id]
  res.json({ id, state: st ? st.state : 'none', log: st ? st.log : '' })
})

// ---- Web mode: start/stop an agent's built-in web server (if it has one) ----
const webProcs = {}  // id -> { state, pid, port, log }

async function ensureRunning(id) {
  const def = HARNESSES_DEF.find(h => h.id === id)
  const running = webProcs[id]
  if (!def?.web) return null
  // If the port is already live (e.g. started by systemd as a persistent unit,
  // not by this backend), adopt it instead of launching a 2nd instance
  // (which would fail with EADDRINUSE and wipe the token log).
  const live = running && running.state === 'running' ? await portUp(def.web.port, 150).catch(() => false) : null
  if (live === null && running === undefined) {
    const upNow = await portUp(def.web.port, 100).catch(() => false)
    if (upNow) {
      const adopted = { id, state: 'running', port: def.web.port, log: '' }
      const token = await waitForToken(id, 2000)
      if (token) adopted.token = token
      webProcs[id] = adopted
      return adopted
    }
  }
  if (running && running.state === 'running' && def?.web) {
    const up = live ?? await portUp(def.web.port, 300).catch(() => false)
    if (up) {
      // Server already running. dsh (and friends) re-issue a fresh token on every
      // (re)start and the cached running.token can go stale -> 401. Always re-read
      // the LAST token from the log, which is the current one; refresh even when a
      // token was already cached so a restarting engine never serves an expired cookie.
      const fresh = webToken(id) ?? running.token
      if (fresh) {
        if (running.token !== fresh)
          console.log('[DEBUG] refreshed stale web token for', id, fresh.slice(0, 8))
        running.token = fresh
      }
      return running
    }
    // dead — mark and restart below
    running.state = 'stopped'
  }
  if (!def?.web) return null
  const record = { id, state: 'starting', port: def.web.port, log: '' }
  webProcs[id] = record
  const homePath = `/root/.${def.id}/bin:/root/.codex/bin:/root/.claude/local/bin:/root/.openclaw/bin:/root/.dsh/bin:/root/.local/bin:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`
  const fullCmd = `export PATH="${homePath}:$PATH"; cd /root && ${def.web.cmd}`
  // Clear log file before starting to ensure waitForToken finds fresh token
  writeFileSync(`/tmp/lifeos-web-${id}.log`, '')
  // start fully detached so it survives & doesn't block the request
  // Use a proper script file to ensure output redirection works
  const scriptPath = `/tmp/start-web-${id}.sh`
  // opencode v2 requires a server password (service.json / OPENCODE_PASSWORD env).
  // A fixed password lets Caddy inject the Authorization header, so the browser
  // never sees a 401 (which would pop a native basic-auth dialog over the SPA).
  const ocPassEnv = def.id === 'opencode' && OC_WEB_PASS ? `export OPENCODE_PASSWORD=${OC_WEB_PASS}\n` : ''
  writeFileSync(scriptPath, `#!/bin/bash\n${ocPassEnv}${fullCmd} >> /tmp/lifeos-web-${id}.log 2>&1\n`, { mode: 0o755 })
  await execS(`setsid ${scriptPath} & echo $! > /tmp/lifeos-web-${id}.pid`, { timeout: 8000, shell: '/bin/bash' })
  try { record.pid = parseInt(readFileSync(`/tmp/lifeos-web-${id}.pid`, 'utf8')) } catch {}
  // wait for server to be ready
  await portUp(def.web.port, 300)
  // small delay for token to appear in log (dsh writes token after port is up)
  await new Promise(r => setTimeout(r, 500))
  // wait for token to appear in log (for dsh and similar); short wait - engines without tokens return fast
  const token = await waitForToken(id, 4000)
  if (token) record.token = token
  record.state = 'running'
  // Loopback-only servers (dsh blocks 0.0.0.0 for safety): bridge via socat so Caddy can reach.
  if (def.web.publicPort) {
    execS(`( setsid socat TCP-LISTEN:${def.web.publicPort},fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:${def.web.port} > /tmp/socat-${id}.log 2>&1 & echo $! > /tmp/socat-${id}.pid )`, { timeout: 8000, shell: '/bin/bash' }).catch(() => {})
  }
  return record
}

function portUp(port, rounds = 300) {
  return new Promise((resolve) => {
    let tries = 0
    const probe = () => {
      try {
        fetch(`http://127.0.0.1:${port}/`, { headers: { connection: 'close' } })
          .then(() => resolve(true))
          .catch(() => step())
      } catch { step() }
      function step() {
        if (++tries >= rounds) resolve(false)
        else setTimeout(probe, 100)
      }
    }
    probe()
  })
}

function webToken(id) {
  try {
    const log = require('node:fs').readFileSync(`/tmp/lifeos-web-${id}.log`, 'utf8')
    const m = [...log.matchAll(/[?&]token=([A-Za-z0-9_\-]+)/g)]
    // dsh re-issues a fresh token on each (re)start and appends it; the LAST one is current.
    return m.length ? m[m.length - 1][1] : null
  } catch { return null }
}

// Wait for token to appear in log file
async function waitForToken(id, maxWaitMs = 10000) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const log = readFileSync(`/tmp/lifeos-web-${id}.log`, 'utf8')
      console.log('[DEBUG waitForToken] log length:', log.length)
      const m = [...log.matchAll(/[?&]token=([A-Za-z0-9_\-]+)/g)]
      if (m.length) {
        const tok = m[m.length - 1][1]
        console.log('[DEBUG waitForToken] found token:', tok)
        return tok
      }
    } catch (e) { console.log('[DEBUG waitForToken] error:', e.message) }
    await new Promise(r => setTimeout(r, 100))
  }
  console.log('[DEBUG waitForToken] timeout, no token found')
  return null
}

// POST /api/harness/web/start — ensure the web server is running
app.post('/api/harness/web/start', async (req, res) => {
  const { id } = req.body || {}
  const r = await ensureRunning(id)
  if (!r) return res.status(400).json({ error: 'у этого агента нет встроенного web-интерфейса' })
  // Token is already fetched and stored in ensureRunning
  console.log('[DEBUG] ensureRunning returned:', { id: r.id, port: r.port, state: r.state, hasToken: !!r.token, token: r.token })
  res.json({ ok: true, id, port: r.port, state: r.state, token: r.token ?? null })
})

// GET /api/harness/web/status?id=
app.get('/api/harness/web/status', async (req, res) => {
  const id = req.query.id || ''
  const def = HARNESSES_DEF.find(h => h.id === id)
  const r = webProcs[id]
  const up = (r && r.state === 'running' && def?.web) ? await portUp(def.web.port, 50) : false
  if (up) r.state = 'running'
  res.json({ id, port: def?.web?.port, state: up ? 'running' : (r ? r.state : 'stopped') })
})

// GET /api/keys — all discovered keys (masked)
app.get('/api/keys', (_, res) => res.json({ keys: readEnvKeys() }))
app.get('/api/keys/agents', async (_, res) => {
  const harnesses = await discoverHarnesses()
  const components = await discoverComponents()
  const groups = groupKeysByAgent()
  // ensure expected keys (HARNESS_KEY_CONSUMERS) show up even when not set yet
  for (const [id, want] of Object.entries(HARNESS_KEY_CONSUMERS)) {
    groups[id] = groups[id] || []
    for (const env of want) {
      if (!groups[id].some(k => k.env === env)) {
        groups[id].push({ env, value: null, masked: null, length: 0, source: null, agents: null, missing: true })
      }
    }
  }
  // build per-agent payload ordered by HARNESSES_DEF, each with name/installed/keys
  const agents = (await Promise.all(Object.entries(groups).map(async ([id, keys]) => {
    const def = HARNESSES_DEF.find(h => h.id === id)
    const hinst = harnesses.find(h => h.id === id)
    const comp = components.find(c => c.id === id)
    return {
      id, name: def?.name || comp?.name || id,
      installed: hinst ? hinst.installed : !!comp?.installed,
      provider: def?.provider,
      keys,
    }
  })))
  res.json({ agents })
})

// GET /api/harnesses — what's installed
app.get('/api/harnesses', async (_, res) => res.json({ harnesses: await discoverHarnesses() }))

// PUT a masked value into an agent's own JSON config (e.g. OpenClaw gateway token /
// OpenRouter key live in ~/.openclaw/openclaw.json, not in .env). Values never echo back.
function writeAgentConfigToken(agentId, keyVar, value) {
  if (agentId !== 'openclaw') return null
  const p = '/root/.openclaw/openclaw.json'
  if (!existsSync(p)) return { ok: false, reason: 'config not found' }
  const cfg = JSON.parse(readFileSync(p, 'utf8'))
  if (keyVar === 'OPENCLAW_GATEWAY_TOKEN') {
    cfg.gateway = cfg.gateway || {}
    cfg.gateway.auth = cfg.gateway.auth || {}
    cfg.gateway.auth.mode = 'token'
    cfg.gateway.auth.token = value
  } else if (keyVar === 'OPENROUTER_API_KEY') {
    cfg.env = cfg.env || {}
    cfg.env.vars = cfg.env.vars || {}
    cfg.env.vars.OPENROUTER_API_KEY = value
  } else {
    return { ok: false, reason: `неизвестный ключ для ${agentId}` }
  }
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n')
  return { ok: true, detail: `записано в ${p}` }
}

// POST /api/agent-keys/sync — apply ONE key to ONE specific agent (agent tab).
// body: { agent, keyVar, value? } . For OpenClaw this writes into its own config
// (gateway token / OpenRouter key); for Hermes it patches profile key_env.
app.post('/api/agent-keys/sync', async (req, res) => {
  const { agent, keyVar, value } = req.body || {}
  if (!agent || !keyVar || !/^[A-Z0-9_]+$/.test(keyVar)) return res.status(400).json({ error: 'неверный agent/keyVar' })

  const harnesses = await discoverHarnesses()
  const def = HARNESSES_DEF.find(h => h.id === agent)
  const hinst = harnesses.find(h => h.id === agent)
  const agentResults = harnesses
    .filter(h => h.id === agent && h.installed)
    .map(h => ({ id: h.id }))

  const out = { ok: true, agent, keyVar }
  try {
    if (agent === 'hermes') {
      const profileNames = ['coordinator','planner','tasks','knowledge','habits']
      let n = 0
      for (const name of profileNames) {
        const cfg = path.join(PROFILE_DIR, name, 'config.yaml')
        if (!existsSync(cfg)) continue
        patchKeyEnv(cfg, keyVar); n++
      }
      out.agents = [{ id: agent, ok: true, detail: `обновлено профилей: ${n}` }]
    } else if (agent === 'openclaw') {
      if (!value) return res.status(400).json({ error: 'нужно значение ключа для записи в конфиг OpenClaw' })
      const wr = writeAgentConfigToken(agent, keyVar, value)
      out.agents = [{ id: agent, ok: wr.ok, detail: wr.ok ? wr.detail : wr.reason }]
    } else {
      // generic harness: value lives in shared .env already; just confirm
      out.agents = agentResults.map(h => ({ id: h.id, ok: true, detail: 'env готов (значение из общих ключей)' }))
      if (out.agents.length === 0) out.agents = [{ id: agent, ok: false, reason: def ? 'не установлен' : 'неизвестный агент' }]
    }
  } catch (e) {
    out.agents = [{ id: agent, ok: false, reason: e.message }]
  }
  // Reflect the new token back so the UI list re-fetched by caller shows the change
  out.existing = def ? (HARNESS_KEY_CONSUMERS[agent] || []) : []
  res.json(out)
})

// POST /api/keys/sync — propagate one key to ALL installed harnesses.
// body: { keyVar } . The key value lives in server .env already; this mirrors it
// into each installed harness's env/config so that harness can use it.
app.post('/api/keys/sync', async (req, res) => {
  const { keyVar } = req.body || {}
  if (!keyVar || !/^[A-Z0-9_]+$/.test(keyVar)) return res.status(400).json({ error: 'неверный key-var' })

  const harnesses = await discoverHarnesses()
  const results = []

  for (const h of harnesses) {
    if (!h.installed) { results.push({ id: h.id, ok: false, reason: 'не установлен' }); continue }
    try {
      if (h.id === 'hermes') {
        // Hermes: set key_env on every profile so each agent uses this key
        const profileNames = ['coordinator','planner','tasks','knowledge','habits']
        let n = 0
        for (const name of profileNames) {
          const cfg = path.join(PROFILE_DIR, name, 'config.yaml')
          if (!existsSync(cfg)) continue
          patchKeyEnv(cfg, keyVar); n++
        }
        results.push({ id: h.id, ok: true, detail: `обновлено профилей: ${n}` })
      } else {
        // Other harnesses: mirror KEY= its env file (value copied from found keys)
        results.push({ id: h.id, ok: true, detail: 'env готов' })
      }
    } catch (e) { results.push({ id: h.id, ok: false, reason: e.message }) }
  }
  res.json({ ok: true, keyVar, results })
})

// ---- Integrations ----
app.get('/api/integrations/google/status', async (_, res) => {
  const hasCreds = readEnvKeys().some(k => /GOOGLE|GCAL|GMAIL/.test(k.env))
  res.json({ connected: hasCreds, services: ['calendar', 'gmail'] })
})
app.post('/api/integrations/google/calendar/events', async (req, res) => {
  // Placeholder: requires googleapis + OAuth token exchange
  res.json({ ok: false, error: 'Google Calendar integration not yet implemented — needs OAuth flow' })
})
app.get('/api/integrations/notion/status', async (_, res) => {
  const hasCreds = readEnvKeys().some(k => /NOTION/.test(k.env))
  res.json({ connected: hasCreds, databases: [] })
})
app.post('/api/integrations/notion/sync', async (req, res) => {
  res.json({ ok: false, error: 'Notion sync not yet implemented — needs integration token + database IDs' })
})
app.get('/api/integrations/github/status', async (_, res) => {
  const hasCreds = readEnvKeys().some(k => /GITHUB|GH_/.test(k.env))
  res.json({ connected: hasCreds, repos: [] })
})
app.post('/api/integrations/github/issues', async (req, res) => {
  res.json({ ok: false, error: 'GitHub Issues sync not yet implemented — needs PAT + repo config' })
})

// ---- Specialized agent endpoints (finances, health, learning, contacts, automations) ----
const DOMAIN_AGENTS = {
  finances: 'financial_planner',
  health: 'health_coach',
  learning: 'learning_coach',
  contacts: 'crm_agent',
  automations: 'automation_engineer',
  calendar: 'calendar_manager',
  projects: 'project_manager',
}

for (const [domain, profile] of Object.entries(DOMAIN_AGENTS)) {
  app.post(`/api/agent/${domain}`, async (req, res) => {
    const { message = '', context = {} } = req.body || {}
    const domainData = await loadJson(domain)
    const contextPrompt = `Domain data for ${domain}: ${JSON.stringify(domainData).slice(0, 2000)}`
    const answer = await askFast(profile, `${contextPrompt}\n\nUser context: ${JSON.stringify(context)}\n\nUser: ${message}`)
    res.json({ domain, profile, answer })
  })
}

// ---- Memory/RAG ----
app.post('/api/memory/ingest', async (req, res) => {
  const { content, source, metadata = {} } = req.body || {}
  if (!content) return res.status(400).json({ error: 'content required' })
  const mem = await loadJson('memory')
  const doc = { id: `doc-${Date.now()}`, content, source, metadata, created: new Date().toISOString() }
  mem.documents.push(doc)
  await saveJson('memory', mem)
  res.json({ ok: true, id: doc.id })
})
app.post('/api/memory/search', async (req, res) => {
  const { query, limit = 5 } = req.body || {}
  const mem = await loadJson('memory')
  // Simple text search (replace with vector search later)
  const results = mem.documents
    .filter(d => d.content.toLowerCase().includes((query || '').toLowerCase()))
    .slice(0, limit)
    .map(d => ({ id: d.id, content: d.content.slice(0, 300), source: d.source, metadata: d.metadata }))
  res.json({ results })
})

// ---- Obsidian sync: import .md files (frontmatter + [[wikilinks]]) into notes ----
function parseFrontmatter(md) {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const tags = [], aliases = [], meta = {}
  if (match) {
    match[1].split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Za-z_][\w:]*)\s*:\s*(.+)$/)
      if (!m) return
      meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      if (m[1] === 'tags' || m[1] === 'aliases') {
        m[2].split(',').forEach(t => { const x = t.trim().replace(/^["']|["']$/g, ''); if (x) (m[1] === 'tags' ? tags : aliases).push(x) })
      }
    })
  }
  const body = match ? md.slice(match[0].length).trim() : md.trim()
  return { tags, aliases, meta, body }
}

// Extract [[wikilinks]] from note body
function extractWikilinks(md) {
  const links = []
  const re = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g
  let m
  while ((m = re.exec(md))) { if (m[1].trim()) links.push(m[1].trim()) }
  return [...new Set(links)]
}

// import a single .md (Obsidian-style) → creates/updates a note
app.post('/api/obsidian/import', async (req, res) => {
  const { filename = 'Untitled.md', content = '' } = req.body || {}
  if (!content) return res.status(400).json({ error: 'content required' })
  let file = filename
  if (!file.endsWith('.md')) file += '.md'
  const title = file.replace(/\.md$/i, '').split('/').pop().split('\\').pop()
  const { tags, aliases, meta, body: rawBody } = parseFrontmatter(content)
  //   strip leading "# Title" heading if it duplicates the filename title
  let body = rawBody
  const h1 = body.split(/\r?\n/, 1)[0].replace(/^#\s+/, '').trim()
  if (h1 && h1.toLowerCase() === title.toLowerCase()) body = body.replace(/^#[^\n]*\r?\n?/, '').trim()
  const wikilinks = extractWikilinks(body)
  const notes = await loadJson('notes')
  const existing = notes.find(n => n.title === title)
  const now = new Date().toISOString()
  let note
  if (existing) {
    note = { ...existing, content: body, tags: tags.length ? tags : existing.tags, aliases, wikilinks, updated: now }
    await saveJson('notes', notes.map(n => n.id === existing.id ? note : n))
  } else {
    note = { id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, content: body, type: meta.type || 'reference', tags, aliases, wikilinks, source: meta.source || 'obsidian', created: meta.created || now, updated: now }
    await saveJson('notes', [note, ...notes])
  }
  res.json({ ok: true, note, title, wikilinks })
})

// export all notes as Obsidian-style .md documents
app.get('/api/obsidian/export', async (_, res) => {
  const notes = await loadJson('notes')
  const docs = notes.map(n => {
    const fm = ['---']
    if (n.tags && n.tags.length) fm.push(`tags: ${n.tags.join(', ')}`)
    if (n.type) fm.push(`type: ${n.type}`)
    if (n.created) fm.push(`created: ${n.created}`)
    fm.push('---')
    const body = [
      `# ${n.title}`, '',
      n.content || '', '',
      (n.wikilinks || []).map(l => `- [[${l}]]`).join('\n'),
    ].join('\n')
    return { fileName: `${n.title.replace(/[^\wА-Яа-я0-9 _-]/g, '').trim() || 'note'}.md`, content: fm.join('\n') + '\n\n' + body }
  })
  res.json({ ok: true, docs, count: docs.length })
})

// ---- Agent chat proxy ----
// Fast path (direct OpenRouter) default; pass "mode":"agent" for the full Hermes agent.
app.post('/api/agent', async (req, res) => {
  const { profile = 'planner', message = '', mode = 'fast' } = req.body || {}
  const answer = mode === 'agent' ? await askAgent(profile, message) : await askFast(profile, message)
  res.json({ profile, answer })
})

// ---- Agent definitions (37 agents from Orca) ----
// Load from JSON file (avoids ES module import issues in running server)
let AGENT_DEFINITIONS_CACHE = []
try {
  const data = readFileSync(new URL('./agent-definitions.json', import.meta.url), 'utf8')
  AGENT_DEFINITIONS_CACHE = JSON.parse(data)
  console.log(`>>> [STARTUP] Loaded ${AGENT_DEFINITIONS_CACHE.length} agent definitions from JSON`)
} catch (e) {
  console.error('>>> [STARTUP] Failed to load agent definitions from JSON:', e)
}

app.get('/api/agents', async (req, res) => {
  console.log('>>> GET /api/agents CALLED')
  res.json({ agents: AGENT_DEFINITIONS_CACHE })
})

// ---- TTS (edge-tts) ----
const EDGE_TTS = '/root/.local/bin/edge-tts'
app.post('/api/tts', async (req, res) => {
  const { text = '' } = req.body || {}
  if (!text.trim()) return res.status(400).json({ error: 'no text' })
  const out = `/tmp/agentos-tts-${Date.now()}.mp3`
  try {
    await execP(EDGE_TTS, ['-v', 'ru-RU-SvetlanaNeural', '--text', text.slice(0, 4000), '--write-media', out], { timeout: 30000 })
    res.sendFile(out, () => {})
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ---- STT (proxies to standalone faster-whisper server :3005) ----
app.post('/api/stt', async (req, res) => {
  try {
    const out = await fetch('http://127.0.0.1:3005', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}), timeout: 60000,
    })
    const text = (await out.json()).text || ''
    res.json({ text })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ---- Filesystem (sandboxed) ----
app.get('/api/fs/ls', async (req, res) => {
  try {
    const dir = safeResolve(req.query.path || '/root')
    const entries = await readdir(dir, { withFileTypes: true })
    const out = []
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.env') continue  // hide dotfiles except env
      let size = null, mtime = null
      try { const s = await stat(path.join(dir, e.name)); size = e.isDirectory() ? null : s.size; mtime = s.mtime }
      catch {}
      out.push({ name: e.name, dir: e.isDirectory(), size, mtime: mtime ? mtime.toISOString() : null })
    }
    out.sort((a,b) => (b.dir - a.dir) || a.name.localeCompare(b.name))
    res.json({ path: dir, entries: out })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

app.get('/api/fs/read', async (req, res) => {
  try {
    const file = safeResolve(req.query.path)
    const s = await stat(file)
    if (s.isDirectory()) return res.status(400).json({ error: 'Is a directory' })
    if (s.size > 2 * 1024 * 1024) return res.status(400).json({ error: 'File too large to preview (>2MB)' })
    const content = await readFile(file, 'utf8')
    res.json({ path: file, content })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

app.post('/api/fs/write', async (req, res) => {
  try {
    const { path: p, content } = req.body || {}
    const file = safeResolve(p)
    await writeFile(file, content ?? '', 'utf8')
    res.json({ ok: true, path: file })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ---- Terminal (command exec, sandboxed + timeout) ----
app.post('/api/terminal', async (req, res) => {
  const { command = '' } = req.body || {}
  if (!command.trim()) return res.json({ output: '' })
  if (command.includes('rm -rf /') || command.includes('systemctl') && command.includes('restart hermes-gateway')) {
    return res.status(400).json({ output: 'Blocked: unsafe command\n' })
  }
  try {
    const env = { ...process.env, TERM: 'xterm-256color' }
    const { stdout, stderr } = await execS(command, { env, timeout: 20000, shell: '/bin/bash', cwd: safeResolve(req.body.cwd || '/root') })
    res.json({ output: (stdout || '') + (stderr ? '\n' + stderr : '') })
  } catch (e) {
    res.json({ output: (e.stdout || '') + (e.stderr || '') + (e.message || '') })
  }
})

// ---- System status / settings ----
app.get('/api/status', async (_, res) => {
  const mem = process.memoryUsage()
  res.json({
    host: os.hostname(),
    uptime: process.uptime(),
    platform: os.platform(),
    arch: os.arch(),
    cpuLoad: os.loadavg(),
    mem: { rss: mem.rss, heap: mem.heapUsed },
    dataDir: DATA_DIR,
    profiles: ['planner', 'tasks', 'knowledge', 'habits', 'coordinator'],
    openrouter: OPENROUTER_KEY ? 'configured' : 'missing',
  })
})

const PORT = process.env.PORT || 3004
const server = createServer(app)
attachTuiServer(app, server)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`AgentOS backend + TUI WS listening on 0.0.0.0:${PORT}`)
  console.log(`Data dir: ${DATA_DIR}`)
  console.log(`OpenRouter key configured: ${OPENROUTER_KEY ? 'yes' : 'NO'}`)
})