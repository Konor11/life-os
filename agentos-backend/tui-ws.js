import { spawn } from 'node-pty'
import { WebSocketServer } from 'ws'
import { exec } from 'child_process'
import http from 'http'
import url from 'url'
import { promisify } from 'util'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const execS = promisify(exec)
const HOME_BINS = ['/root/.opencode/bin', '/root/.codex/bin', '/root/.claude/local/bin',
  '/root/.openclaw/bin', '/root/.dsh/bin', '/root/.local/bin', '/usr/local/bin', '/usr/bin']

async function engineBin(name) {
  try {
    const r = await execS(`command -v ${name}`, { shell: '/bin/bash' })
    if ((r?.stdout || '').trim().startsWith('/')) return (r.stdout).trim()
  } catch {}
  for (const dir of HOME_BINS) {
    try {
      const s = await execS(`[ -x ${dir}/${name} ] && echo yes`, { shell: '/bin/bash' })
      if ((s?.stdout || '').trim().startsWith('yes')) return `${dir}/${name}`
    } catch {}
  }
  return null
}

const HERMES = '/usr/local/lib/hermes-agent/venv/bin/python'
const HERMES_ENTRY = '/usr/local/lib/hermes-agent/hermes'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

// Hermes homes differ per install method: the one-line installer puts a self-contained
// launcher in ~/.hermes/hermes-agent/.hermes/bin/hermes, older layouts exposed
// /usr/local/lib/hermes-agent (python + entry script). Spawning one hardcoded path made
// the Chat tab die with "execvp(3) failed: No such file or directory" on a fresh server.
const HERMES_CANDIDATES = [
  '/usr/local/bin/hermes',
  '/root/.hermes/hermes-agent/.hermes/bin/hermes',
  '/root/.hermes/bin/hermes',
  '/usr/local/lib/hermes-agent/.hermes/bin/hermes',
]

function hermesLaunch() {
  for (const p of HERMES_CANDIDATES) {
    try { if (existsSync(p)) return { cmd: p, args: [] } } catch {}
  }
  try {
    if (existsSync(HERMES) && existsSync(HERMES_ENTRY)) return { cmd: HERMES, args: [HERMES_ENTRY] }
  } catch {}
  return null
}

// Managed profiles live in ~/.hermes/profiles/<name>; 'default' is implicit. Passing -p
// for a profile that does not exist aborts the TUI, so only add it when it is real.
function profileExists(name) {
  if (!name || name === 'default') return false
  try { return existsSync(`/root/.hermes/profiles/${name}`) } catch { return false }
}

// Engine registry: how to spawn each agent harness in a PTY.
// engine=hermes -> hermes --tui -p profile (managed profiles)
// engine=opencode/codex/claude/openclaw -> spawn the CLI directly (must be installed)
const ENGINES = {
  hermes: {
    build: (profile) => {
      const launch = hermesLaunch()
      if (!launch) {
        throw new Error('Hermes не установлен: не найден ни один из ' + HERMES_CANDIDATES.join(', ')
          + '. Установи движок во вкладке «Установка компонентов».')
      }
      const args = [...launch.args, '--tui']
      if (profileExists(profile)) args.push('-p', profile)
      return { cmd: launch.cmd, args, cwd: '/root' }
    },
  },
  opencode: { build: (p) => ({ cmd: 'opencode', args: [], cwd: '/root' }), bin: 'opencode' },
  codex: { build: (p) => ({ cmd: 'codex', args: [], cwd: '/root' }), bin: 'codex' },
  claude: { build: (p) => ({ cmd: 'claude', args: [], cwd: '/root' }), bin: 'claude' },
  pi: { build: (p) => ({ cmd: 'pi', args: [], cwd: '/root' }), bin: 'pi' },
  openclaw: { build: (p) => ({ cmd: 'openclaw', args: [], cwd: '/root' }), bin: 'openclaw' },
}

// ---- TUI session keep-alive (performance) ----
// No session caching by default (TUI_KEEPALIVE_SEC=0): the PTY is killed the
// moment the websocket closes and every open is a fresh TUI boot at the exact
// terminal size. Set TUI_KEEPALIVE_SEC to re-enable detached keep-alive.
const KEEPALIVE_MS = (parseInt(process.env.TUI_KEEPALIVE_SEC, 10) || 30) * 1000
const REPLAY_BYTES = parseInt(process.env.TUI_REPLAY_BYTES, 10) || 262144
const sessions = new Map()  // "engine:profile" -> { pty, engine, profile, buffer, timer, ws }
const active = new Map()    // ws -> session

function sessionKey(engine, profile) { return `${engine}:${profile}` }

function killSession(s) {
  if (s.timer) { clearTimeout(s.timer); s.timer = null }
  try { s.pty.kill() } catch {}
}

// Ink-интерфейсы перерисовывают кадр целиком по SIGWINCH. При переподключении клиент
// получал хвост сырого PTY-потока, а он начинается с середины escape-последовательности:
// экран собирался из обрывков и сам больше не восстанавливался (на телефоне WS рвётся при
// сворачивании вкладки или смене сети — «через какое-то время интерфейс кривой»).
// Вместо реплея просим приложение нарисовать кадр заново: resize в (-1 строку) и обратно.
function nudgeRepaint(s, cols, rows) {
  const c = Math.max(20, parseInt(cols, 10) || 120)
  const r = Math.max(10, parseInt(rows, 10) || 40)
  setTimeout(() => { try { s.pty.resize(c, Math.max(10, r - 1)) } catch {} }, 200)
  setTimeout(() => { try { s.pty.resize(c, r) } catch {} }, 450)
}

export function attachTuiServer(app, server) {
  // Upgrade /ws/tui?engine=E&profile=P to a PTY running the chosen engine.
  const wss = new WebSocketServer({ noServer: true, clientTracking: true })

  // Sync opencode v2 CLI theme mode (~/.config/opencode/cli.json). The running
  // TUI hot-reloads this file, so theme switches apply live. Other engines: no-op.
  function syncOpencodeTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') return
    try {
      const p = '/root/.config/opencode/cli.json'
      let cfg = {}
      try { cfg = JSON.parse(readFileSync(p, 'utf8')) } catch {}
      cfg.theme = { name: 'system', mode: theme }
      writeFileSync(p, JSON.stringify(cfg, null, 2))
    } catch {}
  }

  wss.on('connection', async (ws, req) => {
    const u = url.parse(req.url, true)
    const engine = (u.query.engine || 'hermes').trim()
    const profile = (u.query.profile || 'default').trim()
    console.log(`[tui] ws connected engine=${engine} profile=${profile}`)

    const eng = ENGINES[engine]
    if (!eng) {
      ws.send(JSON.stringify({ type: 'exit', code: 2, error: `неизвестный движок: ${engine}` }))
      ws.close()
      return
    }

    // If this engine is a one-off CLI, verify it's actually installed.
    if (eng.bin && engine !== 'hermes') {
      const found = await engineBin(eng.bin)
      if (!found) {
        ws.send(JSON.stringify({ type: 'exit', code: 3, error: `движок '${engine}' не установлен. Установи его во вкладке «Установка компонентов».` }))
        ws.close()
        return
      }
    }

    const key = sessionKey(engine, profile)
    let s = sessions.get(key)
    // размеры из URL: PTY должен родиться/перерисоваться ровно в размере xterm
    const qcols = Math.min(300, Math.max(20, parseInt(u.query.cols, 10) || 120))
    const qrows = Math.min(300, Math.max(10, parseInt(u.query.rows, 10) || 40))

    if (s && s.pty) {
      // Fast path: re-attach to a live session (no cold spawn).
      syncOpencodeTheme(u.query.theme)
      if (s.timer) { clearTimeout(s.timer); s.timer = null }
      s.ws = ws
      active.set(ws, s)
      // Реплей только по явному запросу (отладка): он даёт битую картинку, потому что
      // буфер — хвост потока, а не целый кадр. Обычный путь — перерисовка приложения.
      if (u.query.replay === '1' && s.buffer.length) {
        try { ws.send(JSON.stringify({ type: 'data', data: s.buffer.join('') })) } catch {}
        console.log(`[tui] re-attached (raw replay ${s.buffer.length} chunks)`)
      } else {
        nudgeRepaint(s, qcols, qrows)
        console.log(`[tui] re-attached engine=${engine} profile=${profile} — repaint requested`)
      }
    } else {
      const ptyEnv = { ...process.env, TERM: 'xterm-256color', OPENROUTER_API_KEY: OPENROUTER_KEY,
        PATH: `/root/.hermes/hermes-agent/.hermes/bin:/root/.hermes/bin:/root/.opencode/bin:/root/.codex/bin:/root/.claude/local/bin:/root/.openclaw/bin:/root/.dsh/bin:/root/.local/bin:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}` }
      delete ptyEnv.HERMES_TUI_GATEWAY_URL
      delete ptyEnv.HERMES_TUI_SIDECAR_URL

      // eng.build() throws with a readable reason when the engine is not installed.
      let built
      try {
        built = eng.build(profile)
      } catch (e) {
        ws.send(JSON.stringify({ type: 'exit', code: 1, error: e?.message || String(e) }))
        ws.close()
        return
      }
      const { cmd, args, cwd } = built
      // apply the client's theme to opencode's config BEFORE the TUI boots
      syncOpencodeTheme(u.query.theme)
      let pty
      try {
        pty = spawn(cmd, args, { name: 'xterm-256color', cols: qcols, rows: qrows, cwd: cwd || '/root', env: ptyEnv })
      } catch (e) {
        console.error(`[tui] pty spawn failed engine=${engine}: ${e.message}`)
        ws.send(JSON.stringify({ type: 'exit', code: 1, error: e.message }))
        ws.close()
        return
      }
      s = { pty, engine, profile, buffer: [], timer: null, ws }
      sessions.set(key, s)
      active.set(ws, s)
      console.log(`[tui] spawned engine=${engine} profile=${profile}`)
    }

    const { pty } = s

    // PTY -> websocket (+ ring buffer for replay)
    pty.onData((data) => {
      s.buffer.push(data)
      let total = 0
      for (let i = s.buffer.length - 1; i >= 0; i--) {
        total += s.buffer[i].length
        if (total > REPLAY_BYTES) { s.buffer.splice(0, i); break }
      }
      if (s.ws && s.ws.readyState === s.ws.OPEN) {
        try { s.ws.send(JSON.stringify({ type: 'data', data })) } catch {}
      }
    })
    pty.onExit(({ exitCode }) => {
      sessions.delete(key)
      if (s.ws && s.ws.readyState === s.ws.OPEN) {
        try { s.ws.send(JSON.stringify({ type: 'exit', code: exitCode })) } catch {}
        try { s.ws.close() } catch {}
      }
      active.forEach((v, w) => { if (v === s) active.delete(w) })
    })

    // websocket -> PTY
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw)
        if (msg.type === 'input' && msg.data) pty.write(msg.data)
        else if (msg.type === 'theme' && msg.theme) { syncOpencodeTheme(msg.theme); }
        else if (msg.type === 'resize' && msg.cols && msg.rows) {
          try { pty.resize(msg.cols, msg.rows) } catch {}
        }
        else if (msg.type === 'repaint') {
          nudgeRepaint(s, msg.cols || qcols, msg.rows || qrows)
        }
      } catch {
        // not JSON — treat as raw input
        try { pty.write(String(raw)) } catch {}
      }
    })

    ws.on('close', () => {
      if (active.get(ws) === s) active.delete(ws)
      if (s.ws === ws) s.ws = null
      // keep the PTY alive for a grace period so the next connect is instant
      if (sessions.get(key) === s && !s.timer) {
        s.timer = setTimeout(() => {
          console.log(`[tui] idle session expired engine=${engine} profile=${profile}`)
          sessions.delete(key)
          killSession(s)
        }, KEEPALIVE_MS)
      }
      console.log(`[tui] ws closed engine=${engine} profile=${profile} (session kept ${KEEPALIVE_MS / 1000}s)`)
    })
  })

  server.on('upgrade', (req, socket, head) => {
    const u = url.parse(req.url, true)
    console.log(`[tui] upgrade? pathname=${u.pathname}`)
    if (u.pathname === '/ws/tui') {
      console.log(`[tui] MATCH upgrading to ws`)
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    }
  })
}
