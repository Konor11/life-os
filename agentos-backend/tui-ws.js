import { spawn } from 'node-pty'
import { WebSocketServer } from 'ws'
import { exec } from 'child_process'
import http from 'http'
import url from 'url'
import { promisify } from 'util'

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

// Engine registry: how to spawn each agent harness in a PTY.
// engine=hermes -> hermes --tui -p profile (managed profiles)
// engine=opencode/codex/claude/openclaw -> spawn the CLI directly (must be installed)
const ENGINES = {
  hermes: {
    build: (profile) => ({ cmd: HERMES, args: [HERMES_ENTRY, '--tui', '-p', profile], cwd: '/root' }),
  },
  opencode: { build: (p) => ({ cmd: 'opencode', args: [], cwd: '/root' }), bin: 'opencode' },
  codex: { build: (p) => ({ cmd: 'codex', args: [], cwd: '/root' }), bin: 'codex' },
  claude: { build: (p) => ({ cmd: 'claude', args: [], cwd: '/root' }), bin: 'claude' },
  pi: { build: (p) => ({ cmd: 'pi', args: [], cwd: '/root' }), bin: 'pi' },
  openclaw: { build: (p) => ({ cmd: 'openclaw', args: [], cwd: '/root' }), bin: 'openclaw' },
}

// ---- TUI session keep-alive (performance) ----
// Spawning a TUI (node/ink boot) takes seconds; killing the PTY the moment the
// websocket closes made every engine switch a cold start. Instead, a detached
// session stays alive for TUI_KEEPALIVE_SEC (default 600s) and the next connect
// for the same engine+profile re-attaches instantly and replays the scrollback.
// A ring buffer (TUI_REPLAY_BYTES, default 256KB) covers the detached window.
const KEEPALIVE_MS = (parseInt(process.env.TUI_KEEPALIVE_SEC, 10) || 600) * 1000
const REPLAY_BYTES = parseInt(process.env.TUI_REPLAY_BYTES, 10) || 262144
const sessions = new Map()  // "engine:profile" -> { pty, engine, profile, buffer, timer, ws }
const active = new Map()    // ws -> session

function sessionKey(engine, profile) { return `${engine}:${profile}` }

function killSession(s) {
  if (s.timer) { clearTimeout(s.timer); s.timer = null }
  try { s.pty.kill() } catch {}
}

export function attachTuiServer(app, server) {
  // Upgrade /ws/tui?engine=E&profile=P to a PTY running the chosen engine.
  const wss = new WebSocketServer({ noServer: true, clientTracking: true })

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

    if (s && s.pty) {
      // Fast path: re-attach to a live session (no cold spawn).
      if (s.timer) { clearTimeout(s.timer); s.timer = null }
      s.ws = ws
      active.set(ws, s)
      // replay the detached window into a clean terminal
      if (s.buffer.length) {
        try { ws.send(JSON.stringify({ type: 'data', data: s.buffer.join('') })) } catch {}
      }
      console.log(`[tui] re-attached session engine=${engine} profile=${profile} (replay ${s.buffer.length} chunks)`)
    } else {
      const ptyEnv = { ...process.env, TERM: 'xterm-256color', OPENROUTER_API_KEY: OPENROUTER_KEY,
        PATH: `/root/.opencode/bin:/root/.codex/bin:/root/.claude/local/bin:/root/.openclaw/bin:/root/.dsh/bin:/root/.local/bin:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}` }
      delete ptyEnv.HERMES_TUI_GATEWAY_URL
      delete ptyEnv.HERMES_TUI_SIDECAR_URL

      const { cmd, args, cwd } = eng.build(profile)
      let pty
      try {
        pty = spawn(cmd, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: cwd || '/root', env: ptyEnv })
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
        else if (msg.type === 'resize' && msg.cols && msg.rows) {
          try { pty.resize(msg.cols, msg.rows) } catch {}
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
