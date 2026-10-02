import { useState, useRef, useEffect, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { TermKeypad } from './TermKeypad'
import { Icon } from '../Icons'

// Настоящий интерактивный терминал.
//
// Раньше вкладка была одноразовым исполнителем команд: поле ввода + кнопка Run →
// POST /api/terminal → `bash -c` → напечатанный вывод. Ни PTY, ни сессии: `cd` не
// удерживался, `top`/`vim`/`hermes` в интерактиве не запускались. Шапка с тремя
// кружками «macOS» и кнопкой Run ничего не делала — это была декорация.
//
// Теперь это xterm.js поверх node-pty в tmux: закрыл вкладку или перезапустил панель —
// вернулся, тот же экран. Соединение — WebSocket /ws/shell.
//
// Цвета терминала берутся из палитры панели: --term-* в index.css ссылаются на --cx-*,
// поэтому терминал всегда в цветах выбранной темы.

const RESIZE_TAG = '\u0001'   // служебный префикс, с клавиатуры не набирается

function readTermTheme() {
  const cs = getComputedStyle(document.documentElement)
  const c = (n, f) => (cs.getPropertyValue(n) || '').trim() || f
  return {
    background: c('--term-bg', '#111'),
    foreground: c('--term-text', '#eee'),
    cursor: c('--term-text', '#eee'),
    cursorAccent: c('--term-bg', '#111'),
    selectionBackground: c('--term-accent', '#58a6ff'),
    black: c('--term-text', '#111'),
    brightBlack: c('--term-muted', '#666'),
    green: c('--term-prompt', '#3fb950'),
    brightGreen: c('--term-prompt', '#3fb950'),
    red: c('--term-err', '#f85149'),
    brightRed: c('--term-err', '#f85149'),
    blue: c('--term-cmd', '#58a6ff'),
    brightBlue: c('--term-cmd', '#58a6ff'),
    cyan: c('--term-accent', '#58a6ff'),
    magenta: c('--term-accent', '#bc8cff'),
    yellow: c('--term-muted', '#d29922'),
  }
}

const ROOTS = [
  { p: '/', label: '/ — корень' },
  { p: '/root', label: '/root' },
  { p: '/root/workspace', label: '/root/workspace' },
  { p: '/tmp', label: '/tmp' },
  { p: '/home', label: '/home' },
]

export function TerminalPanel({ cwd, onCwdChange }) {
  const hostRef = useRef(null)
  const termRef = useRef(null)
  const wsRef = useRef(null)
  const [conn, setConn] = useState('idle')     // idle | connecting | live | closed
  const [dir, setDir] = useState(cwd || '/root/workspace')
  const [fontSize, setFontSize] = useState(13)
  const [keypad, setKeypad] = useState(() => {
    try { return localStorage.getItem('lifeos.terminal.keypad') === '1' } catch { return false }
  })
  const [err, setErr] = useState('')
  

  const connect = useCallback((startCwd, fresh = false) => {
    const term = termRef.current
    if (!term) return
    try { wsRef.current?.close() } catch {}
    setConn('connecting')
    setErr('')

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const mode = document.documentElement.getAttribute('data-mode')
    // reset=1 — попросить у сервера НОВУЮ сессию. Обычное подключение присоединяется к
    // той же самой: иначе каждая переподключка плодила бы живую tmux-сессию (проверено:
    // накопилось 14 за полчаса тестов).
    const ws = new WebSocket(
      `${proto}://${location.host}/ws/shell` +
      `?cwd=${encodeURIComponent(startCwd || '/root/workspace')}` +
      `&cols=${term.cols || 80}&rows=${term.rows || 24}&theme=${mode}` +
      (fresh ? '&reset=1' : '')
    )
    wsRef.current = ws

    ws.onopen = () => { setConn('live'); setErr('') }
    ws.onmessage = (ev) => { if (typeof ev.data === 'string') term.write(ev.data) }
    ws.onerror = () => {
      // Сокет, который закрыли МЫ (смена вкладки, размонтирование), ошибкой не является.
      if (ws.__closing) return
      setConn('closed')
      setErr('соединение с терминалом оборвалось — переподключаюсь')
    }
    ws.onclose = () => {
      if (ws.__closing) return
      setConn((s) => (s === 'idle' ? s : 'closed'))
    }
  }, [])

  // Каталог для первого подключения. Дальше он меняется только через `cd` внутри
  // сессии, поэтому в зависимостях эффекта его быть НЕ должно.
  const initialCwd = useRef(cwd || '/root/workspace')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace',
      fontSize, lineHeight: 1.25, cursorBlink: true, cursorStyle: 'bar',
      allowProposedApi: true, scrollback: 10000, theme: readTermTheme(),
    })
    termRef.current = term

    let fit = null
    try { fit = new FitAddon(); term.loadAddon(fit) } catch { /* подгонка необязательна */ }
    try { term.loadAddon(new Unicode11Addon()) } catch {}
    try { new WebglAddon().activate(term) } catch { /* без GPU — обычный рендер */ }

    term.open(host)
    // Подгоняем размер ДО подключения: иначе сервер откроет сессию 80x24, а окно уже —
    // строки начнут переноситься.
    requestAnimationFrame(() => { try { fit?.fit() } catch {} })

    const applyTheme = () => {
      try { term.options.theme = readTermTheme() } catch {}
    }
    const obs = new MutationObserver((muts) => {
      if (muts.some(m => m.attributeName === 'data-mode' || m.attributeName === 'data-theme')) applyTheme()
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode', 'data-theme'] })
    applyTheme()

    const pushResize = () => {
      try { fit?.fit() } catch {}
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(`${RESIZE_TAG}RESIZE ${term.cols}:${term.rows}`)
    }
    // OSC 7: bash сообщает настоящий каталог. Раньше шапка показывала путь, заданный при
    // подключении, и после `cd` руками она врала.
    term.parser?.registerOscHandler(7, (payload) => {
      try {
        const path = decodeURIComponent(String(payload).replace(/^file:\/\//, ''))
        if (path && path.startsWith('/')) { setDir(path); onCwdChange?.(path) }
      } catch {}
      return true
    })

    term.onData((d) => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(d)
    })
    let ro
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(pushResize); ro.observe(host) }

    const start = initialCwd.current
    setDir(start)
    const t = setTimeout(() => connect(start), 60)

    return () => {
      clearTimeout(t)
      try { obs.disconnect() } catch {}
      try { ro?.disconnect() } catch {}
      // Закрываем сокет МЯГКО: пометка, что закрытие намеренное, иначе onerror
      // покажет «соединение оборвалось» на следующем же соединении.
      try { if (wsRef.current) wsRef.current.__closing = true } catch {}
      try { wsRef.current?.close() } catch {}
      try { term.dispose() } catch {}
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Смену палитры НЕ делаем поводом для переподключения: цвета применяются к живому
  // xterm через MutationObserver (см. ниже). Переподключение при смене темы раньше
  // плодило по сессии на каждый переход. Раньше на сервере копились остатки.

  // Кегль: применяется к живому терминалу, переподключать ради этого незачем.
  useEffect(() => {
    // `termRef.current?.options.fontSize = x` не собирается: опциональная цепочка не
    // может быть целью присваивания. Нужен явный тернарный/if-разбор.
    try { const t = termRef.current; if (t) t.options.fontSize = fontSize } catch {}
    try { localStorage.setItem('lifeos.terminal.font', String(fontSize)) } catch {}
  }, [fontSize])

  // Смена каталога — обычная команда `cd` в живой сессии. Раньше здесь вызывался
  // connect(), то есть терминал пересоздавался: терялась история и плодились сокеты.
  const go = (p) => {
    const target = p.startsWith('/') ? p : `/${p}`
    setDir(target)
    onCwdChange?.(target)
    const q = target.replace(/'/g, `'\\''`)
    send(`cd '${q}'\n`)
  }
  const up = () => {
    const parent = dir.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/'
    go(parent)
  }
  const send = (data) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data)
    else termRef.current?.write(data)
  }
  const toggleKeypad = () => setKeypad(v => {
    const n = !v
    try { localStorage.setItem('lifeos.terminal.keypad', n ? '1' : '0') } catch {}
    return n
  })

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border font-mono"
      style={{ background: 'rgb(var(--term-bg))', borderColor: 'rgb(var(--term-border))' }}>
      {/* Шапка: только то, что что-то делает. Раньше здесь стояли три нарисованных
          кружка «macOS», не связанные ни с чем. */}
      <div className="flex items-center gap-2 px-3 py-2 flex-wrap shrink-0"
        style={{ background: 'var(--term-header)', borderBottom: '1px solid rgb(var(--term-border))' }}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${
          conn === 'live' ? 'bg-success' : conn === 'connecting' ? 'bg-warning' : 'bg-danger'}`} />
        <span className="text-xs truncate" style={{ color: 'rgb(var(--term-muted))' }}>{dir}</span>
        <span className="text-[11px] hidden sm:inline" style={{ color: 'rgb(var(--term-muted))' }}>
          {conn === 'live' ? 'живой шелл в tmux' : conn === 'connecting' ? 'подключение…' : 'нет связи'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={up} title="На уровень выше"
            className="px-2 py-0.5 rounded border"
            style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>
            <Icon name="ArrowUp" size={13} />
          </button>
          <select value={dir} onChange={e => go(e.target.value)}
            className="px-2 py-1 rounded border text-xs"
            style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>
            {ROOTS.map(r => <option key={r.p} value={r.p}>{r.label}</option>)}
          </select>
          <button onClick={() => setFontSize(f => Math.min(24, Math.max(10, f - 1)))} title="Мельче"
            className="px-2 py-0.5 rounded border text-sm font-semibold"
            style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>−</button>
          <span className="text-xs" style={{ color: 'rgb(var(--term-text))' }}>{fontSize}</span>
          <button onClick={() => setFontSize(f => Math.min(24, Math.max(10, f + 1)))} title="Крупнее"
            className="px-2 py-0.5 rounded border text-sm font-semibold"
            style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>+</button>
          <button onClick={() => connect(dir, true)} title="Новая сессия шелла"
            className="px-2 py-0.5 rounded border"
            style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>
            +
          </button>
          <button onClick={() => connect(dir)} title="Переподключиться"
            className="px-2 py-0.5 rounded border"
            style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>
            <Icon name="RefreshCw" size={13} />
          </button>
          <button onClick={toggleKeypad}
            className={`px-2 py-0.5 rounded text-xs border font-semibold ${keypad ? 'text-white' : ''}`}
            style={keypad
              ? { background: 'rgb(var(--term-accent))', borderColor: 'rgb(var(--term-accent))' }
              : { color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}
            title="Клавиатура">⌨</button>
        </div>
      </div>

      {err && (
        <div className="px-3 py-1.5 text-[11px] text-danger shrink-0"
          style={{ borderBottom: '1px solid rgb(var(--term-border))' }}>{err}</div>
      )}

      <div ref={hostRef} className="flex-1 min-h-0 px-2 py-1 overflow-hidden" />

      {keypad && <TermKeypad onSend={send} />}
    </div>
  )
}