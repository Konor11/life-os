import { spawn } from 'node-pty'
import { WebSocketServer } from 'ws'
import { exec } from 'child_process'
import http from 'http'
import url from 'url'
import { promisify } from 'util'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { wsAllowed } from './auth.js'

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

// ---- Персистентность сессии через tmux (принцип AgentDeck/Ptylon) ----
// Было: PTY движка жил ВНУТРИ процесса панели, поэтому закрытая вкладка убивала агента через
// KEEPALIVE (30 с), а перезапуск панели — сразу. Стало: движок живёт в tmux-сессии на отдельном
// сокете (-L lifeos) со своим конфигом, а в нашем PTY работает только КЛИЕНТ tmux. Отсюда:
//  * закрыл вкладку или перезапустил панель — агент продолжает работать;
//  * повторное подключение: tmux рисует экран целиком, поэтому сырой реплей (и его обрывки
//    посреди escape-последовательности) больше не нужен;
//  * размер окна задан вручную (window-size manual): SIGWINCH приходит приложению только когда мы
//    сами попросили ресайз, а не от каждого дёрганья клиента (клавиатура, адресная строка).
const TMUX_SOCKET = 'lifeos'
// Сколько ждать перед автоудалением осиротевшей сессии. Обычно движок удаляют и сразу хотят, чтобы
// мусор исчез, но час — минимум, чтобы не снести сессию в момент установки/переустановки движка.
const ORPHAN_GRACE_SEC = 60 * 60
const TMUX_CONF = '/root/.lifeos-tmux.conf'
const TMUX_KEEPALIVE_MS = (parseInt(process.env.TUI_TMUX_KEEPALIVE_SEC, 10) || 43200) * 1000
let tmuxPath = null

const tmuxReady = (async () => {
  try {
    writeFileSync(TMUX_CONF, [
      '# Life OS: терминал панели. Перезаписывается бэкендом при старте.',
      'set -g default-terminal "tmux-256color"',
      'set -g status off',             // статус-бар tmux съел бы строку у TUI со своим статусом
      // ВАЖНО: window-size здесь НЕ задаём. В tmux 3.6 (Debian) любая запись window-size —
      // и глобально в конфиге, и точечно `set-option -t` — роняет сервер tmux («server exited
      // unexpectedly»), и TUI перестаёт запускаться вовсе. Размер окна tmux ведёт сам по клиенту
      // (штатное поведение), а мы управляем размером через pty клиента.
      'set -g history-limit 20000',
      'set -g mouse off',              // отчёты колеса должны доходить до приложения (жест листания)
      'set -g escape-time 10',
      'set -g focus-events on',
      'set -g destroy-unattached off', // отключённый клиент НЕ должен убивать сессию
    ].join('\n') + '\n')
  } catch {}
  try {
    const r = await execS('command -v tmux', { shell: '/bin/bash' })
    const p = (r?.stdout || '').trim()
    if (p.startsWith('/')) tmuxPath = p
  } catch {}
  // Сервер tmux держит отдельный юнит lifeos-tui: если поднимать его из процесса панели, он
  // остаётся в cgroup службы и systemctl restart lifeos убивает ВСЕ сессии агентов вместе с ним
  // (проверено: после перезапуска панели маркер в терминале исчезал). Поэтому сервер поднимает юнит.
  if (tmuxPath) {
    const ls = await tmuxRun('list-sessions')
    if (!ls.ok) {
      try { await execS('systemctl start lifeos-tui', { shell: '/bin/bash' }); await new Promise(r => setTimeout(r, 1200)) } catch {}
    }
  }
  // Самопроверка: битый tmux (или битый конфиг) не должен ломать TUI. Проверяем, что сессия
  // реально создаётся, и только тогда включаем персистентность.
  if (tmuxPath) {
    const probe = await tmuxRun('new-session -d -s __lifeos_selftest "sleep 2"')
    if (!probe.ok) {
      console.error(`[tui] tmux не работает: ${(probe.out || '').trim().split('\n')[0]} — продолжаю без персистентности`)
      tmuxPath = null
    } else {
      await tmuxRun('kill-session -t __lifeos_selftest')
    }
  }
  // Подчистка брошенных сессий: панель могла перезапуститься, и её таймеры потерялись, а сессии
  // tmux живут дальше. Смотрим время последней активности и закрываем те, что простояли дольше лимита.
  if (tmuxPath) {
    try {
      const list = await tmuxRun("list-sessions -F '#{session_name} #{session_activity}'")
      if (list.ok) {
        const now = Math.floor(Date.now() / 1000)
        for (const line of list.out.trim().split('\n')) {
          const parts = line.trim().split(/\s+/)
          const name = parts[0], act = parseInt(parts[1], 10)
          if (!name || name === '__keeper' || !name.startsWith('lifeos-') || !act) continue

          // Раньше здесь стояло «нет вывода дольше TMUX_KEEPALIVE → убить». Это ломало самое
          // ценное в сессиях: агент, который тихо ждёт твою команду 12 часов, выглядит как
          // «брошенный», хотя это нормальная работа. Так были убиты lifeos-hermes-laptop и
          // lifeos-opencode при перезапуске панели.
          //
          // Теперь автоочистка трогает ТОЛЬКО осиротевшие сессии — движок удалён или профиля
          // больше нет. Их всё равно нельзя открыть в панели, и они только занимают место.
          // Всё остальное живёт, пока не закроет сам пользователь (кнопка «убрать» или 🔄).
          const { engine, profile } = parseTmuxName(name)
          const orphan = orphanReason({ engine, profile })
          if (!orphan) continue
          if (now - act < ORPHAN_GRACE_SEC) continue
          console.log(`[tui] закрываю осиротевшую tmux-сессию ${name} (${orphan})`)
          await tmuxRun(`kill-session -t ${name}`)
        }
      }
    } catch {}
  }
  console.log(`[tui] tmux: ${tmuxPath ? tmuxPath + ' — сессии переживают закрытие вкладки и перезапуск панели' : 'выключен, сессии умрут вместе с панелью'}`)
})()

function tmuxSessionName(engine, profile) {
  const suffix = profile && profile !== 'default' ? '-' + profile : ''
  return ('lifeos-' + engine + suffix).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60)
}

async function tmuxRun(args) {
  if (!tmuxPath) return { ok: false, out: '' }
  try {
    const r = await execS(`"${tmuxPath}" -L ${TMUX_SOCKET} -f ${TMUX_CONF} ${args}`, { shell: '/bin/bash' })
    return { ok: true, out: (r?.stdout || '') }
  } catch (e) {
    return { ok: false, out: `${e?.stdout || ''}${e?.stderr || ''}` }
  }
}

async function tmuxAlive(name) {
  if (!tmuxPath || !name) return false
  const r = await tmuxRun(`has-session -t ${name} 2>/dev/null`)
  return r.ok
}

// Вставка большого текста одним куском. У PTY-сокетов бывает лимит кадра (в чужих проектах —
// 65536 байт, сверх лимита соединение рвётся кодом 1009), да и приложению мегабайтная запись разом
// ничего хорошего не делает. Режем ПО БАЙТАМ, но границу двигаем по code point'ам: разорвать
// многобайтовый UTF-8 в середине нельзя.
const WRITE_CHUNK_BYTES = 60 * 1024

export function chunkByBytes(str, budget = WRITE_CHUNK_BYTES) {
  const out = []
  let cur = '', size = 0
  for (const ch of String(str)) {
    const b = Buffer.byteLength(ch)
    if (size + b > budget && cur) { out.push(cur); cur = ''; size = 0 }
    cur += ch; size += b
  }
  if (cur) out.push(cur)
  return out
}

function writeToPty(pty, data) {
  const s = String(data)
  if (Buffer.byteLength(s) <= WRITE_CHUNK_BYTES) { try { pty.write(s) } catch {} ; return }
  const parts = chunkByBytes(s)
  let i = 0
  const next = () => {
    if (i >= parts.length) return
    try { pty.write(parts[i++]) } catch {}
    setTimeout(next, 10)
  }
  next()
}

function killSession(s) {
  if (s.timer) { clearTimeout(s.timer); s.timer = null }
  try { s.pty.kill() } catch {}
  if (s.tmux) tmuxRun(`kill-session -t ${s.tmux} 2>/dev/null`)
}

// Ink-интерфейсы перерисовывают кадр целиком по SIGWINCH. При переподключении клиент
// получал хвост сырого PTY-потока, а он начинается с середины escape-последовательности:
// экран собирался из обрывков и сам больше не восстанавливался (на телефоне WS рвётся при
// сворачивании вкладки или смене сети — «через какое-то время интерфейс кривой»).
// Вместо реплея просим приложение нарисовать кадр заново: resize в (-1 строку) и обратно.
function nudgeRepaint(s, cols, rows, force) {
  const c = Math.max(20, parseInt(cols, 10) || 120)
  const r = Math.max(10, parseInt(rows, 10) || 40)
  // Нудж — это два SIGWINCH (строка туда-обратно), на каждый Ink перерисовывает кадр целиком.
  // Если размер уже совпадает с PTY, автоматический нудж не нужен: он стоил бы двух полных
  // перерисовок — а это и есть то мигание, на которое жалуются.
  // НО: явная просьба клиента (`force`) выполняется всегда. Клиент просит кадр, когда его экран
  // пуст (переподключение к живой сессии), и при равном размере подавление просьбы оставляло
  // пользователя с пустым терминалом до первой записи вывода приложения.
  if (!force && s.pty.cols === c && s.pty.rows === r) return
  setTimeout(() => { try { s.pty.resize(c, Math.max(10, r - 1)) } catch {} }, 200)
  setTimeout(() => { try { s.pty.resize(c, r) } catch {} }, 450)
}

// Движки, чьи сессии мы умеем распознавать в именах tmux. Порядок важен: длинные имена
// ('opencode') проверяются раньше коротких префиксов, иначе 'lifeos-opencode' распался бы на
// 'open' + 'code'.
const KNOWN_ENGINES = ['hermes', 'opencode', 'codex', 'claude', 'openclaw', 'dsh']

// 'lifeos-hermes-laptop' -> { engine: 'hermes', profile: 'laptop' }
// 'lifeos-codex'        -> { engine: 'codex', profile: 'default' }
function parseTmuxName(name) {
  const base = String(name || '').replace(/^lifeos-/, '')
  for (const e of KNOWN_ENGINES) {
    if (base === e) return { engine: e, profile: 'default' }
    if (base.startsWith(e + '-')) return { engine: e, profile: base.slice(e.length + 1) }
  }
  return { engine: base || 'unknown', profile: 'default' }
}

// Снимок состояния сессий для внешнего наблюдения.
//
// ВАЖНО: источник правды — tmux, а не карта `sessions` в памяти этого процесса. Сессии
// персистентны (lifeos-tui.service), поэтому они живут и тогда, когда браузер ничего не открывал.
// Раньше снимок смотрел только в память, и дашборд показывал «нет подключённых сессий», хотя
// шесть сессий агентов работали в tmux по несколько часов. Теперь список — из tmux, а из памяти
// берётся только то, чего в tmux нет: подключён ли сейчас браузер и когда шёл вывод.
// Существует ли профиль на диске. Сессия от профиля, которого больше нет, — мусор: в панели
// такого профиля не выбрать, но tmux-сессия продолжает висеть и занимать место в дашборде.
function profileExistsNow(profile) {
  if (!profile || profile === 'default') return true
  try { return existsSync(`/root/.hermes/profiles/${profile}`) } catch { return false }
}

// Установлен ли движок. Hermes ищется по своему списку кандидатов, остальные — по бинарнику
// (в том числе в /root/.opencode/bin, куда opencode кладёт себя сам и куда нет в PATH).
export function engineInstalled(engine) {
  if (engine === 'hermes') return !!hermesLaunch()
  const def = ENGINES[engine]
  if (!def) return false
  const dirs = ['/root/.local/bin', '/root/.opencode/bin', '/usr/local/bin', '/usr/bin']
  for (const d of dirs) {
    try { if (existsSync(`${d}/${def.bin || engine}`)) return true } catch {}
  }
  return false
}

// Почему сессия осиротевшая (пустая строка — всё в порядке).
export function orphanReason(s) {
  if (!engineInstalled(s.engine)) return 'движок удалён'
  if (!profileExistsNow(s.profile)) return 'профиля больше нет'
  return ''
}

export async function sessionSnapshot() {
  const out = []
  const now = Date.now()

  // 1) что реально живёт в tmux
  let tmuxList = []
  try {
    const r = await tmuxRun(
      `list-sessions -F '#{session_name}\t#{session_created}\t#{session_attached}' 2>/dev/null`)
    for (const line of String(r.out || '').split('\n')) {
      const [name, created, attached] = line.split('\t')
      if (!name || name === '__keeper') continue      // keeper — служебная, агентом не считается
      const { engine, profile } = parseTmuxName(name)
      const mem = sessions.get(`${engine}:${profile}`)
      out.push({
        key: `${engine}:${profile}`,
        tmux: name,
        engine,
        profile,
        // Подключён ли браузер именно к этой сессии
        attached: !!(mem && mem.ws && mem.ws.readyState === 1),
        // Активность: из памяти, если подключена; иначе неизвестно (сессия живёт, но не пишет)
        idleMs: mem && mem.lastDataAt ? now - mem.lastDataAt : null,
        since: created ? Number(created) * 1000 : null,
        ageMs: created ? now - Number(created) * 1000 : null,
        // Мусор: движок удалили или профиль исчез. Такие сессии показываем отдельно и
        // предлагаем закрыть — иначе дашборд врёт про «работающих агентов».
        orphan: orphanReason({ engine, profile }),
      })
    }
  } catch (e) {
    console.error('[tui] не удалось опросить tmux для снимка сессий:', e?.message || e)
  }

  // 2) сессии, которые есть в памяти, но по какой-то причине не видны в tmux (гонка при старте)
  for (const [key, s] of sessions) {
    if (out.some(x => x.key === key)) continue
    out.push({
      key,
      tmux: s.tmux || null,
      engine: s.engine,
      profile: s.profile,
      attached: !!(s.ws && s.ws.readyState === 1),
      idleMs: s.lastDataAt ? now - s.lastDataAt : null,
      since: s.startedAt || null,
      ageMs: s.startedAt ? now - s.startedAt : null,
      orphan: orphanReason({ engine: s.engine, profile: s.profile }),
    })
  }

  return out
}

// Закрыть сессию агента (нужно для кнопки «убрать» у осиротевших). Только tmux-сессия: если
// вкладка открыта, WebSocket получит exit и клиент это покажет.
export async function closeSession(tmuxName) {
  const name = String(tmuxName || '')
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(name) || !name.startsWith('lifeos-') || name === '__keeper') {
    return { ok: false, error: 'некорректное имя сессии' }
  }
  const r = await tmuxRun(`kill-session -t ${name} 2>/dev/null`)
  return r && r.ok ? { ok: true } : { ok: false, error: 'не удалось закрыть сессию' }
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

    await tmuxReady
    const key = sessionKey(engine, profile)
    let s = sessions.get(key)
    // размеры из URL: PTY должен родиться/перерисоваться ровно в размере xterm
    const qcols = Math.min(300, Math.max(20, parseInt(u.query.cols, 10) || 120))
    const qrows = Math.min(300, Math.max(10, parseInt(u.query.rows, 10) || 40))

    // HERMES_PTY_HOST=dashboard — официальный признак «TUI зеркалят в веб-терминал» (его же ставит
    // hermes_cli/pty_bridge.py). Без него приложение считает, что перед ним обычный терминал, и
    // рисует кадр диффом, оставляя на экране строки, которые больше не перерисовывает: после /help
    // внизу остаётся старая статусная строка рядом с новой.
    // HERMES_TUI_THEME: тема Hermes-TUI выбирается ПРИ СТАРТЕ из окружения (см. ui-tui/src/theme.ts,
    // detectLightMode) и живьём не переключается. Без неё TUI в светлой теме панели рисовал тёмной
    // палитрой по белому фону — текст не читается.
    const hermesTheme = u.query.theme === 'light' ? 'light' : 'dark'
    const ptyEnv = { ...process.env, TERM: 'xterm-256color', HERMES_PTY_HOST: 'dashboard',
      HERMES_TUI_THEME: hermesTheme,
      OPENROUTER_API_KEY: OPENROUTER_KEY,
      PATH: `/root/.hermes/hermes-agent/.hermes/bin:/root/.hermes/bin:/root/.opencode/bin:/root/.codex/bin:/root/.claude/local/bin:/root/.openclaw/bin:/root/.dsh/bin:/root/.local/bin:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}` }
    delete ptyEnv.HERMES_TUI_GATEWAY_URL
    delete ptyEnv.HERMES_TUI_SIDECAR_URL

    if (tmuxPath) {
      // Переподключение к живой сессии и запуск новой — одна и та же команда `new-session -A`.
      // `destroy-unattached off` в конфиге означает, что отключение клиента сессию не убивает.
      let built
      try {
        built = eng.build(profile)
      } catch (e) {
        ws.send(JSON.stringify({ type: 'exit', code: 1, error: e?.message || String(e) }))
        ws.close()
        return
      }
      syncOpencodeTheme(u.query.theme)
      const tname = tmuxSessionName(engine, profile)
      const existed = await tmuxAlive(tname)
      // tmux отдаёт новой панели ОГРАНИЧЕННЫЙ список переменных окружения (update-environment):
      // HERMES_TUI_THEME и HERMES_PTY_HOST до движка не дошли бы. Пробрасываем нужные явно,
      // командой самой панели — это единственный надёжный путь (set-environment не помогает
      // самой первой сессии: сервер ещё не запущен).
      const paneCmd = ['env',
        `HERMES_PTY_HOST=${ptyEnv.HERMES_PTY_HOST}`,
        `HERMES_TUI_THEME=${hermesTheme}`,
        ...(ptyEnv.OPENROUTER_API_KEY ? [`OPENROUTER_API_KEY=${ptyEnv.OPENROUTER_API_KEY}`] : []),
        built.cmd, ...built.args]
      let pty
      try {
        pty = spawn(tmuxPath,
          ['-L', TMUX_SOCKET, '-f', TMUX_CONF, 'new-session', '-A', '-s', tname,
            '-x', String(qcols), '-y', String(qrows), ...paneCmd],
          { name: 'xterm-256color', cols: qcols, rows: qrows, cwd: built.cwd || '/root', env: ptyEnv })
      } catch (e) {
        console.error(`[tui] tmux spawn failed engine=${engine}: ${e.message}`)
        ws.send(JSON.stringify({ type: 'exit', code: 1, error: e.message }))
        ws.close()
        return
      }
      if (!s) { s = { engine, profile, buffer: [], timer: null, ws: null } }
      if (s.timer) { clearTimeout(s.timer); s.timer = null }
      s.pty = pty; s.ws = ws; s.tmux = tname; s.buffer = []
      s.startedAt = Date.now()
      sessions.set(key, s)
      active.set(ws, s)
      if (existed) {
        // Клиент подключился к живой сессии: tmux сам подгонит окно под размер клиента и нарисует
        // экран целиком (поэтому сырой реплей не нужен).
        console.log(`[tui] tmux re-attach t=${tname} ${qcols}x${qrows}`)
      } else {
        console.log(`[tui] tmux new session t=${tname} ${qcols}x${qrows}`)
      }
    } else if (s && s.pty) {
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
        // На переподключении НЕ дёргаем размер: клиент сам перерисует уже имеющийся буфер, а если
        // у него пустой экран — он явно попросит кадр сообщением {type:'repaint'}. Нудж на каждом
        // переподключении заставлял приложение перерисовываться целиком (мигание).
        console.log(`[tui] re-attached engine=${engine} profile=${profile} — no replay (client repaints)`)
      }
    } else {
      // Окружение (ptyEnv) построено выше, чтобы им пользовались обе ветки: tmux и прямой spawn.

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
      s.lastDataAt = Date.now()
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
    pty.onExit(async ({ exitCode }) => {
      // С tmux выход клиента ≠ выход агента: клиент отключается, а сессия с движком продолжает
      // жить — в этом весь смысл. Приложение действительно закончилось, только если сессии нет.
      if (s.tmux && await tmuxAlive(s.tmux)) {
        if (s.pty === pty) s.pty = null
        if (s.ws === ws) s.ws = null
        active.delete(ws)
        console.log(`[tui] tmux client detached engine=${engine} (сессия жива)`)
        return
      }
      sessions.delete(key)
      if (s.ws && s.ws.readyState === s.ws.OPEN) {
        try { s.ws.send(JSON.stringify({ type: 'exit', code: exitCode })) } catch {}
        try { s.ws.close() } catch {}
      }
      active.forEach((v, w) => { if (v === s) active.delete(w) })
    })

    // websocket -> PTY
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw)
        if (msg.type === 'input' && msg.data) writeToPty(pty, msg.data)
        else if (msg.type === 'theme' && msg.theme) { syncOpencodeTheme(msg.theme); }
        else if (msg.type === 'resize' && msg.cols && msg.rows) {
          // Пропускаем повтор того же размера: node-pty пошлёт SIGWINCH, приложение перерисует
          // кадр целиком. Именно повторные одинаковые resize (серии от раскладки) давали мигание.
          const c = parseInt(msg.cols, 10), r = parseInt(msg.rows, 10)
          if (c && r && (c !== pty.cols || r !== pty.rows)) { try { pty.resize(c, r) } catch {} }
        }
        else if (msg.type === 'restart') {
          // Полный перезапуск движка из панели. С tmux сессия живёт долго, поэтому зависший агент
          // иначе сбрасывается только из консоли: убиваем сессию (её клиент выйдет сам), забываем
          // запись и просим панель подключиться заново.
          console.log(`[tui] restart requested engine=${engine} profile=${profile}`)
          if (s.tmux) await tmuxRun(`kill-session -t ${s.tmux} 2>/dev/null`)
          if (s.timer) { clearTimeout(s.timer); s.timer = null }
          sessions.delete(key)
          try { ws.send(JSON.stringify({ type: 'restarting' })) } catch {}
          try { pty.kill() } catch {}
        }
        else if (msg.type === 'repaint') {
          // С tmux полный кадр при подключении клиента рисует сам tmux — просим его обновить экран.
          if (s.tmux) tmuxRun(`refresh-client -t ${s.tmux} 2>/dev/null`)
          // force: клиент сам решает, что ему нужен полный кадр (у него пустой экран).
          else nudgeRepaint(s, msg.cols || qcols, msg.rows || qrows, true)
        }
      } catch {
        // not JSON — treat as raw input
        try { pty.write(String(raw)) } catch {}
      }
    })

    ws.on('close', () => {
      if (active.get(ws) === s) active.delete(ws)
      if (s.ws === ws) s.ws = null
      if (s.tmux) {
        // Гасим ТОЛЬКО клиента: агент в tmux продолжает работать. Саму сессию закрываем по
        // длинному таймауту (по умолчанию 12 ч), чтобы брошенные сессии не копились вечно.
        try { pty.kill() } catch {}
        if (!s.timer) {
          s.timer = setTimeout(() => {
            console.log(`[tui] tmux session expired t=${s.tmux}`)
            sessions.delete(key)
            killSession(s)
          }, TMUX_KEEPALIVE_MS)
        }
        console.log(`[tui] ws closed engine=${engine} — tmux-сессия жива (до закрытия ${Math.round(TMUX_KEEPALIVE_MS / 3600000)} ч)`)
        return
      }
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
      // WebSocket идёт мимо express, поэтому вход проверяем здесь: без куки в TUI не пускаем
      // (иначе форма входа на фронте обходилась бы сокетом).
      if (!wsAllowed(req)) {
        console.log(`[tui] ws upgrade без входа — отказ`)
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        socket.destroy()
        return
      }
      console.log(`[tui] MATCH upgrading to ws`)
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    }
  })
}
