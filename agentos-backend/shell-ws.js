// Настоящий интерактивный терминал для вкладки Terminal.
//
// Раньше вкладка была одноразовым исполнителем: поле ввода → POST /api/terminal →
// `bash -c` → напечатанный вывод. Ни PTY, ни сессии: `cd` не удерживался, top/vim/
// hermes в интерактиве не запускались. Здесь — настоящий шелл.
//
// Живёт в tmux на сокете `lifeos` (тот же, что у TUI), поэтому закрытие вкладки и даже
// перезапуск панели не убивают сессию: вернулся — увидел тот же экран. Прямой node-pty
// дал бы «умер вместе со вкладкой», а это ровно то, от чего мы уже уходили с TUI.

import { spawn } from 'node-pty'
import { WebSocketServer } from 'ws'
import url from 'url'
import { execFile } from 'child_process'
import { writeFileSync, rmSync, existsSync as fsExists } from 'fs'
import { markShellAttached } from './tui-ws.js'
import { promisify } from 'util'
import { wsAllowed } from './auth.js'

const execF = promisify(execFile)

// Каталоги, куда можно попасть. '/' добавлен по требованию: песочница из трёх папок
// (/root, /tmp, /home) прятала настоящий корень файловой системы, и в файловом
// менеджере было некуда подняться выше /root.
const ALLOWED_ROOTS = ['/', '/root', '/tmp', '/home']

// Каталоги, куда входить нельзя даже при разрешённом '/': системные и виртуальные
// деревья. Запрет проверяется по ПРЕФИКСУ после нормализации пути.
const DENY_PREFIXES = ['/proc', '/sys', '/dev', '/run', '/var/lib/docker', '/snap']

// Каталог для запуска по умолчанию: /root, но не его содержимое целиком. Чистый
// каталог без клонов, бэкапов и временных файлов — то, что видит человек в первый
// момент. Прежние /root показывали рабочий каталог сервера со всем мусором.
export const DEFAULT_CWD = '/root/workspace'

function normalize(p) {
  if (typeof p !== 'string' || !p) return null
  let out = p
  try { out = p.replace(/\/+$/, '') } catch { return null }
  if (out === '') return '/'
  return out
}

// Проверка пути: внутри разрешённого корня и не в запрещённом поддереве.
// Без нормализации «..» позволял бы выйти из песочницы: /root/../etc.
export function isAllowedPath(p) {
  const n = normalize(p)
  if (!n) return false
  if (n.includes('/../') || n.endsWith('/..') || n.includes('/./')) return false
  if (DENY_PREFIXES.some(d => n === d || n.startsWith(d + '/'))) return false
  return ALLOWED_ROOTS.some(root => root === '/' ? true : n === root || n.startsWith(root + '/'))
}

// Каталоги в песочнице — для переключателя в интерфейсе.
export function sandboxRoots() {
  return ['/', '/root', '/tmp', '/home']
}

// Метка служебных сообщений (размер окна). \u0001 не набирается с клавиатуры.
export const RESIZE_TAG = '\u0001'

let seq = 0

// Сессия шелла — ИМЕНОВАННАЯ, как у движков.
//
// С уникальным суффиксом на каждое подключение (как было сначала) сессии копились
// вечно: `new-session -A` создавал новую, а закрытие сокета её намеренно не убивало —
// после нескольких переподключений оставалось 14 живых шеллов, и вернуться в прежний
// было нельзя. Теперь вкладка всегда присоединяется к СВОЕЙ сессии, как терминал на
// рабочем столе: закрыл вкладку — вернулся, тот же экран и тот же каталог.
const SHELL_MAIN = '__shell'

function sessionNameFor(reset) {
  if (!reset) return SHELL_MAIN
  return `${SHELL_MAIN}-${++seq}`
}

export function attachShellWS(server) {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws, req) => {
    const u = url.parse(req.url, true)
    const q = u.query || {}
    let cwd = normalize(q.cwd) || DEFAULT_CWD
    if (!isAllowedPath(cwd)) cwd = DEFAULT_CWD

    const cols = Math.max(20, Math.min(400, parseInt(q.cols, 10) || 80))
    const rows = Math.max(6, Math.min(200, parseInt(q.rows, 10) || 24))

    // Окружение как у TUI: пути движков, HOME, тема терминала под текущий режим панели.
    const dark = q.theme !== 'light'
    const env = {
      ...process.env,
      HOME: process.env.HOME || '/root',
      TERM: 'xterm-256color',
      PATH: [
        '/root/.local/bin',
        '/root/.hermes/bin',
        '/root/.hermes/hermes-agent/.hermes/bin',
        '/root/.opencode/bin',
        '/root/.dsh/bin',
        '/root/.claude/local/bin',
        process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      ].join(':'),
      HERMES_TUI_THEME: dark ? 'dark' : 'light',
    }

    // name=__shell-1 — переключиться на конкретную сессию (список приходит из /api/shell/sessions).
    // reset=1 — попросить новую. Обычное подключение — главная сессия.
    const want = typeof q.name === 'string' ? q.name : ''
    const name = /^__shell(-\d+)?$/.test(want) ? want
      : sessionNameFor(q.reset === '1' || q.reset === 'true')
    let pty = null

    // Сессия в tmux: переживает переподключение и перезапуск панели.
    // bash сам сообщает панели текущий каталог через OSC 7 (последовательность
    // печатается в промпте, а не пишется во вход — иначе bash пытается её выполнить).
    const rcfile = `/tmp/lifeos-shellrc-${process.pid}-${name}`
    try {
      writeFileSync(rcfile,
        "PROMPT_COMMAND='printf \"\\033]7;file://$PWD\\007\";'\n" +
        "case \"$PROMPT_COMMAND\" in *';'*) ;; *) PROMPT_COMMAND=\"$PROMPT_COMMAND\"; ;; esac\n" +
        "PS1=\"\\[\\e]0;\\u@\\h:\\W\\a\\]${PS1}\"\n" +
        "[ -f ~/.bashrc ] && . ~/.bashrc\n", { mode: 0o644 })
    } catch { /* без rcfile шелл просто не будет сообщать путь */ }

    const tmuxArgs = [
      '-L', 'lifeos', 'new-session', '-A', '-s', name,
      '-c', cwd,
      '-x', String(cols), '-y', String(rows),
      'bash', '--rcfile', rcfile, '-i',
    ]

    try {
      pty = spawn('tmux', tmuxArgs, { name: 'xterm-256color', cols, rows, env, cwd })
    } catch (e) {
      ws.send(`\x1b[31mне удалось запустить терминал: ${e.message}\x1b[0m\r\n`)
      ws.close()
      return
    }

    ws.send(`\x1b[2m[сессия ${name}]\x1b[0m\r\n`)
    // Здесь была отправка OSC 7 в pty.write() — это ОШИБКА: escape-последовательность,
    // записанная во вход, попадает в bash как команда («command not found»), а
    // file:///root/workspacepwd склеивался со следующим вводом и ломал шелл.
    // OSC 7 должен печатать сам шелл через PROMPT_COMMAND, а панель его не подменяет.
    // Каталог и так виден в промпте и в шапке вкладки.

    pty.onData((d) => { try { ws.send(d) } catch {} })
    pty.onExit(({ exitCode, signal }) => {
      try {
        ws.send(`\x1b[2m[шелл завершился: код ${exitCode}${signal ? ', ' + signal : ''}]\x1b[0m\r\n`)
        ws.close()
      } catch {}
    })

    ws.on('message', (raw) => {
      const s = raw.toString()
      // Служебное сообщение о размере окна не должно попадать в терминал.
      // Префикс — непечатаемый \u0001: с пробелом пользователь мог бы случайно
      // напечатать « RESIZE 80:24» и сдвинуть размер терминала.
      if (s.startsWith(RESIZE_TAG)) {
        const m = s.match(/RESIZE (\d+):(\d+)/)
        if (m) {
          try { pty.resize(Math.max(20, +m[1]), Math.max(6, +m[2])) } catch {}
        }
        return
      }
      try { pty.write(s) } catch {}
    })

    try { markShellAttached(name, true) } catch {}
    const bye = () => {
      try { markShellAttached(name, false) } catch {}
      try { if (fsExists(rcfile)) rmSync(rcfile) } catch {}
      // Саму tmux-сессию НЕ убиваем: вернёмся — тот же экран. Убивает её /api/shell/kill
      // или перезагрузка сервера с keeper'ом.
      try { ws.close() } catch {}
    }
    ws.on('close', bye)
    ws.on('error', bye)
  })

  server.on('upgrade', (req, socket, head) => {
    const u = url.parse(req.url, true)
    if (u.pathname !== '/ws/shell') return
    if (!wsAllowed(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  return wss
}

// Список живых сессий шелла — панель показывает их в настройках и позволяет закрыть.
export async function shellSessions() {
  try {
    const r = await execF('tmux', ['-L', 'lifeos', 'list-sessions', '-F', '#{session_name}'])
    return String(r.stdout || '')
      .split('\n')
      .map(s => s.trim())
      // Раньше фильтр был startsWith('__shell-') — с дефисом, из-за чего ГЛАВНАЯ сессия
      // __shell выпадала из списка и её нельзя было закрыть. Ровно то, что смутило
      // пользователя: в списке «2 сессии», а на деле их три, и одна из них главная.
      .filter(s => /^__shell(-\d+)?$/.test(s))
  } catch { return [] }
}

export async function killShellSession(name) {
  if (!/^__shell(-\d+)?$/.test(String(name || ''))) return false
  try { await execF('tmux', ['-L', 'lifeos', 'kill-session', '-t', name]); return true } catch { return false }
}