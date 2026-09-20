import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { execFile, exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises'
import { existsSync, realpathSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import { attachTuiServer } from './tui-ws.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = '/root/agentos-data'
const ALLOWED_ROOTS = ['/root', '/tmp', '/home']  // terminal/fs sandbox
const execP = promisify(execFile)
const execS = promisify(exec)

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
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
app.get('/api/all', async (_, res) => res.json({
  plan: await loadJson('plan'), tasks: await loadJson('tasks'), notes: await loadJson('notes'), habits: await loadJson('habits'),
  finances: await loadJson('finances'), health: await loadJson('health'), learning: await loadJson('learning'),
  contacts: await loadJson('contacts'), automations: await loadJson('automations'), memory: await loadJson('memory'),
  calendar: await loadJson('calendar')
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
    id: 'hermes', name: 'Hermes', alwaysInstalled: true,
    bin: ['/usr/local/bin/hermes'], install: null,
    desc: 'Главный harness Life OS. Профили: coordinator, planner, tasks, knowledge, habits.',
    provider: 'OpenRouter', key: 'OPENROUTER_API_KEY',
  },
  {
      id: 'opencode', name: 'OpenCode', bin: ['opencode'],
      install: "curl -fsSL https://opencode.ai/install -o /tmp/install-opencode.sh && bash /tmp/install-opencode.sh --no-modify-path </dev/null; rm -f /tmp/install-opencode.sh",
      desc: 'Open-source терминальный AI-агент для кода. Официальный установщик ставит собранный бинарь (быстрее, чем npm).',
      provider: 'OpenRouter', key: null,
      web: { port: 4096, cmd: 'opencode serve --port 4096 --hostname 0.0.0.0' },
      uninstall: "rm -rf /root/.opencode /root/.config/opencode /root/.local/share/opencode /root/.cache/opencode /root/.opencode.json; npm uninstall -g opencode-ai 2>/dev/null; rm -f /usr/local/bin/opencode 2>/dev/null; true",
    },
  {
    id: 'codex', name: 'Codex', bin: ['codex'],
    install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh </dev/null",
    desc: 'OpenAI Codex — официальный установщик OpenAI (не npm).',
    provider: 'OpenAI', key: null,
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
    web: { port: 6286, cmd: 'openclaw dashboard --host 0.0.0.0' },
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
]

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

async function discoverHarnesses() {
  const out = []
  for (const h of HARNESSES_DEF) {
    const installed = h.alwaysInstalled || await binExists(h.bin)
    out.push({
      id: h.id, name: h.name, installed,
      desc: h.desc, provider: h.provider, key: h.key,
      installCmd: installed ? null : h.install,
      uninstallCmd: h.uninstall || null,
      web: h.web || null,
      bin: installed ? null : h.bin.join(' / '),
    })
  }
  return out
}

// POST /api/harness/install — install one agent (runs installCmd in background)
const installs = {}  // id -> {state, log}
const uninstalls = {}  // id -> {state, log}

app.post('/api/harness/install', async (req, res) => {
  const { id } = req.body || {}
  const def = HARNESSES_DEF.find(h => h.id === id)
  if (!def) return res.status(404).json({ error: 'агент не найден' })
  if (installs[id]?.state === 'running') return res.json({ ok: true, state: 'running' })
  installs[id] = { state: 'running', log: '' }
  const cmd = def.install
  execS(cmd, { timeout: 240000, shell: '/bin/bash' })
    .then(r => {
      installs[id].state = 'done'
      installs[id].log += (r?.stdout || '') + (r?.stderr || '')
      installs[id].log += '\n[установка завершена]'
    })
    .catch(e => {
      installs[id].state = 'error'
      installs[id].log += (e?.stdout || '') + (e?.stderr || '') + `\n[ошибка] ${e?.message || ''}`
    })
  res.json({ ok: true, state: 'running' })
})

// POST /api/harness/uninstall — full removal (npm uninstall + binary + config dirs)
app.post('/api/harness/uninstall', async (req, res) => {
  const { id } = req.body || {}
  const def = HARNESSES_DEF.find(h => h.id === id)
  if (!def) return res.status(404).json({ error: 'агент не найден' })
  if (!def.uninstall) return res.status(400).json({ error: 'для этого агента нет команды удаления' })
  if (uninstalls[id]?.state === 'running') return res.json({ ok: true, state: 'running' })
  uninstalls[id] = { state: 'running', log: '' }
  execS(def.uninstall, { timeout: 60000, shell: '/bin/bash' })
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
  writeFileSync(scriptPath, `#!/bin/bash
${fullCmd} >> /tmp/lifeos-web-${id}.log 2>&1
`, { mode: 0o755 })
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

// GET /api/harnesses — what's installed
app.get('/api/harnesses', async (_, res) => res.json({ harnesses: await discoverHarnesses() }))

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

// ---- Agent chat proxy ----
// Fast path (direct OpenRouter) default; pass "mode":"agent" for the full Hermes agent.
app.post('/api/agent', async (req, res) => {
  const { profile = 'planner', message = '', mode = 'fast' } = req.body || {}
  const answer = mode === 'agent' ? await askAgent(profile, message) : await askFast(profile, message)
  res.json({ profile, answer })
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