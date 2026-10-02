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

// Сессия шелла. Имя — с уникальным суффиксом, чтобы несколько вкладок не делили экран.
function newSessionName() { return `__shell-${process.pid}-${++seq}` }

export function attachShellWss(server) {
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

    const name = newSessionName()
    let pty = null

    // Сессия в tmux: переживает переподключение и перезапуск панели.
    const tmuxArgs = [
      '-L', 'lifeos', 'new-session', '-A', '-s', name,
      '-c', cwd,
      '-x', String(cols), '-y', String(rows),
      'bash', '-l',
    ]

    try {
      pty = spawn('tmux', tmuxArgs, { name: 'xterm-256color', cols, rows, env, cwd })
    } catch (e) {
      ws.send(`\x1b[31mне удалось запустить терминал: ${e.message}\x1b[0m\r\n`)
      ws.close()
      return
    }

    ws.send(`\x1b[2m[сессия ${name}]\x1b[0m\r\n`)

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

    const bye = () => {
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
      .filter(s => s.startsWith('__shell-'))
  } catch { return [] }
}

export async function killShellSession(name) {
  if (!name || !name.startsWith('__shell-')) return false
  try { await execF('tmux', ['-L', 'lifeos', 'kill-session', '-t', name]); return true } catch { return false }
}