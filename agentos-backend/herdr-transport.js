// ---- Транспорт herdr для сессий Life OS --------------------------------
// herdr (https://herdr.dev) — мультиплексор как tmux, но с socket API: сервер
// держит панели, клиент подключается и отключается, сессии переживают всё.
// Роли те же, что у tmux-ветки tui-ws.js: движок живёт В СЕССИИ herdr, а в
// нашем PTY работает только КЛИЕНТ (`herdr session attach <name>`).
//
// Отличие от tmux, о котором надо помнить: в tmux сессия создаётся СРАЗУ с
// движком как своим процессом — движок вышел, сессия умерла, onExit рапортует.
// В herdr CLI не умеет spawning панели с командой: в панели живёт shell, и
// движок запускается ВНУТРЬ него через `pane run`. Когда движок завершается,
// пользователь видит shell — сессия не умирает. Поэтому «restart» и закрытие
// сессии тут всегда явные (кнопка в панели), автодетекта выхода нет.

import { spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import pty from 'node-pty'

const HERDR_CANDIDATES = ['/root/.local/bin/herdr']
let herdrPath = null
export function herdrBin() {
  if (herdrPath) return herdrPath
  for (const p of HERDR_CANDIDATES) if (existsSync(p)) { herdrPath = p; break }
  return herdrPath
}

// --- текущий транспорт панели ------------------------------------------------
// Приоритет: переменная окружения LIFEOS_TRANSPORT (стенд/тесты) → файл
// /root/.lifeos/transport.json → tmux. Файл кэшируем на 2 секунды, чтобы
// переключение из настроек подхватывалось без перезапуска панели.
let transportCache = { value: null, at: 0 }
export function currentTransport() {
  const forced = (process.env.LIFEOS_TRANSPORT || '').trim().toLowerCase()
  if (forced === 'herdr' || forced === 'tmux') return forced
  const now = Date.now()
  if (now - transportCache.at < 2000) return transportCache.value || 'tmux'
  let value = 'tmux'
  try {
    const p = '/root/.lifeos/transport.json'
    if (existsSync(p)) {
      const cfg = JSON.parse(readFileSync(p, 'utf8'))
      if (cfg.transport === 'herdr' || cfg.transport === 'tmux') value = cfg.transport
    }
  } catch { /* битый файл — остаёмся на tmux */ }
  transportCache = { value, at: now }
  return value
}
export function resetTransportCache() { transportCache = { value: null, at: 0 } }

// --- имена и вызовы CLI -------------------------------------------------------
export function herdrSessionName(engine, profile) {
  const raw = `lifeos-${engine}${profile && profile !== 'default' ? `-${profile}` : ''}`
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 50)
}

async function herdrCli(args, { timeoutMs = 12000 } = {}) {
  const bin = herdrBin()
  if (!bin) return { ok: false, error: 'herdr не установлен' }
  return new Promise((resolve) => {
    const p = spawn(bin, args, { env: { ...process.env, PATH: `/root/.local/bin:${process.env.PATH || ''}` } })
    let out = '', err = ''
    const t = setTimeout(() => { try { p.kill('SIGKILL') } catch {} }, timeoutMs)
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { err += d })
    p.on('error', (e) => { clearTimeout(t); resolve({ ok: false, error: e.message, out, err }) })
    p.on('close', (code) => { clearTimeout(t); resolve({ ok: code === 0, code, out, err }) })
  })
}

// Живёт ли сервер сессии (сокет отвечает) — по списку панелей.
export async function herdrSessionUp(name) {
  const r = await herdrCli(['--session', name, 'pane', 'list'])
  if (r.ok) {
    try { return { up: true, panes: JSON.parse(r.out).result?.panes || [] } }
    catch { return { up: false } }
  }
  return { up: false }
}

// Поднять сервер сессии: единственный документированный способ — подключить
// клиента, которому нужен настоящий TTY (иначе «zero-sized grid»). Поднимаем
// скрытого клиента в собственном PTY, ждём сокет, затем клиента гасим: сервер
// переживает отключение (проверено на 0.9.3), дальше подключаются боевые клиенты.
export async function ensureSession(name, { cols = 120, rows = 40 } = {}) {
  const bin = herdrBin()
  if (!bin) return { ok: false, error: 'herdr не установлен' }
  const st = await herdrSessionUp(name)
  if (st.up) return { ok: true, panes: st.panes }
  let client
  try {
    client = pty.spawn(bin, ['session', 'attach', name],
      { name: 'xterm-256color', cols, rows, cwd: '/root', env: { ...process.env, PATH: `/root/.local/bin:${process.env.PATH || ''}` } })
  } catch (e) { return { ok: false, error: `не удалось поднять сессию: ${e.message}` } }
  // Ждём сокет до 15 с: сервер стартует быстро, но на слабой машине — не мгновенно.
  const deadline = Date.now() + 15000
  let up = false
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700))
    const probe = await herdrSessionUp(name)
    if (probe.up) { up = true; break }
  }
  try { client.kill() } catch {}
  return up ? { ok: true, panes: (await herdrSessionUp(name)).panes } : { ok: false, error: 'сервер herdr не поднялся за 15 с' }
}

// Запустить команду движка в первой панели сессии (shell-уровень).
export async function runEngineInPane(name, cmdArgs, { env = {}, cwd = '/root' } = {}) {
  const panes = (await herdrSessionUp(name)).panes || []
  const pane = panes.find((p) => p.focused) || panes[0]
  if (!pane) return { ok: false, error: 'в сессии herdr нет панелей' }
  const envPrefix = Object.entries(env).map(([k, v]) => `${k}=${shellQuote(String(v))}`).join(' ')
  const line = `cd ${shellQuote(cwd)} && ${envPrefix ? `${envPrefix} ` : ''}${cmdArgs.map(shellQuote).join(' ')}`
  const r = await herdrCli(['--session', name, 'pane', 'run', pane.pane_id, line])
  return r.ok ? { ok: true, pane: pane.pane_id } : { ok: false, error: r.err || r.out || 'pane run не удался' }
}

function shellQuote(s) {
  if (/^[A-Za-z0-9_@%+=:,./-]*$/.test(s)) return s
  return `'${s.replace(/'/g, `'\\''`)}'`
}

// Остановить сессию целиком (restart / закрытие / чистка осиротевших).
export async function stopSession(name) {
  const r = await herdrCli(['session', 'stop', name])
  return r.ok ? { ok: true } : { ok: false, error: r.err || 'session stop не удался' }
}

// Список живых lifeos-сессий herdr — для снимка сессий на дашборде.
export async function listSessions() {
  const r = await herdrCli(['session', 'list'])
  if (!r.ok) return []
  const out = []
  for (const line of String(r.out || '').split('\n').slice(1)) {
    const m = line.match(/^\s*(\S+)\s+(running|stopped)\s+/)
    if (m && m[1].startsWith('lifeos-') && m[2] === 'running') out.push(m[1])
  }
  return out
}
