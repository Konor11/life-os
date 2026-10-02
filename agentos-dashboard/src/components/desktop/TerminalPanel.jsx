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
  // Сессия, выбранная с дашборда (или ранее использованная), — иначе после клика по
  // «шелл 2» на карточке открывалась бы главная.
  const [session, setSession] = useState(() =>
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('lifeos.shellSession')) || '__shell')
  const [allShells, setAllShells] = useState([])        // список для переключателя
  const [conn, setConn] = useState('idle')     // idle | connecting | live | closed
  const [dir, setDir] = useState(cwd || '/root/workspace')
  const [fontSize, setFontSize] = useState(13)
  const [keypad, setKeypad] = useState(() => {
    try { return localStorage.getItem('lifeos.terminal.keypad') === '1' } catch { return false }
  })
  const [err, setErr] = useState('')
  

  const connect = useCallback((startCwd, fresh = false, sess = null) => {
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
    const wantSess = sess || session
    if (sess && sess !== session) setSession(sess)
    const ws = new WebSocket(
      `${proto}://${location.host}/ws/shell` +
      `?cwd=${encodeURIComponent(startCwd || '/root/workspace')}` +
      `&cols=${term.cols || 80}&rows=${term.rows || 24}&theme=${mode}` +
      (fresh ? '&reset=1' : '') +
      (fresh ? '' : `&name=${encodeURIComponent(wantSess)}`)
    )
    wsRef.current = ws

    ws.onopen = () => {
      setConn('live'); setErr('')
      fetch('/api/shell/sessions').then(r => r.ok ? r.json() : null)
        .then(j => { if (j?.sessions) setAllShells(j.sessions) }).catch(() => {})
    }
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
  // FitAddon нужен вне эффекта монтирования: им же пересчитывается сетка при смене кегля.
  const fitRef = useRef(null)

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
    // Фокус сразу: без него на телефоне не поднимается клавиатура, и ввод невозможен —
    // терминал выглядит живым, но не печатает. Проверено: пока не кликнули по экрану,
    // команда не уходила.
    requestAnimationFrame(() => {
      try { fit?.fit() } catch {}
      try { term.focus() } catch {}
    })
    // Список живых сессий шелла — чтобы их можно было переключать, а не только создавать.
    ;(async () => {
      try {
        const r = await fetch('/api/shell/sessions')
        if (r.ok) setAllShells(await r.json())
      } catch {}
    })()
    // Возврат фокуса после смены вкладки: мобильный браузер его снимает.
    const onVis = () => { if (!document.hidden) { try { term.focus() } catch {} } }
    document.addEventListener('visibilitychange', onVis)

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

    fitRef.current = fit
    const start = initialCwd.current
    setDir(start)
    const t = setTimeout(() => connect(start), 60)

    return () => {
      clearTimeout(t)
      try { document.removeEventListener('visibilitychange', onVis) } catch {}
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
    const t = termRef.current
    if (t) {
      t.options.fontSize = fontSize
      // ВАЖНО: без пересчёта сетки менялся только размер символа, а число колонок и строк
      // оставалось прежним — блок терминала сжимался, и выглядело это как «уменьшается сам
      // терминал, а не шрифт». fit() пересчитывает cols/rows под новый размер символа,
      // поэтому текст просто становится мельче, а терминал занимает ту же площадь.
      try { fitRef.current?.fit() } catch {}
    }
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
      {/* Шапка в ДВА ряда. Раньше всё в один ряд: на телефоне перезагрузка и клавиатура
          (последние в списке) уезжали за край и были не видны. Наверх вынесено то, чем
          пользуются чаще всего. */}
      <div className="flex items-center gap-2 px-3 pt-2 shrink-0"
        style={{ background: 'var(--term-header)' }}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${
          conn === 'live' ? 'bg-success' : conn === 'connecting' ? 'bg-warning' : 'bg-danger'}`} />
        <span className="text-xs truncate min-w-0" style={{ color: 'rgb(var(--term-muted))' }}>{dir}</span>
        <span className="text-[11px] hidden sm:inline shrink-0" style={{ color: 'rgb(var(--term-muted))' }}>
          {conn === 'live' ? 'живой шелл в tmux' : conn === 'connecting' ? 'подключение…' : 'нет связи'}
        </span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {/* Кнопки верхнего ряда крупные: 31×23 пикселя мимо пальцем не попасть,
              и на телефоне их можно просто не заметить. */}
          <button onClick={() => connect(dir)} title="Переподключиться"
            className="w-9 h-9 flex items-center justify-center rounded-lg border shrink-0"
            style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>
            <Icon name="RefreshCw" size={16} />
          </button>
          <button onClick={toggleKeypad}
            className={`w-9 h-9 flex items-center justify-center rounded-lg border shrink-0 ${keypad ? 'text-white' : ''}`}
            style={keypad
              ? { background: 'rgb(var(--term-accent))', borderColor: 'rgb(var(--term-accent))' }
              : { color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}
            title="Клавиатура"><Icon name="Keyboard" size={15} /></button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap shrink-0"
        style={{ background: 'var(--term-header)', borderBottom: '1px solid rgb(var(--term-border))' }}>
        <div className="flex items-center gap-1.5">
          <button onClick={up} title="На уровень выше"
            className="px-2 py-0.5 rounded border"
            style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>
            <Icon name="ArrowUp" size={13} />
          </button>
          <select value={dir} onChange={e => go(e.target.value)}
            className="px-1.5 py-1 rounded border text-xs min-w-0 flex-1"
            style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>
            {ROOTS.map(r => <option key={r.p} value={r.p}>{r.label}</option>)}
          </select>
          {/* Кегль одним сегментом: три отдельные кнопки плюс число занимали ~130px и
              выдавливали остальное за экран телефона. */}
          <div className="flex items-center shrink-0 rounded border overflow-hidden"
            style={{ borderColor: 'rgb(var(--term-border))' }}>
            <button onClick={() => setFontSize(f => Math.min(24, Math.max(10, f - 1)))} title="Мельче"
              className="px-1.5 py-1 text-sm font-semibold"
              style={{ color: 'rgb(var(--term-text))', background: 'rgb(var(--term-bg))' }}>−</button>
            <span className="px-1 text-xs tabular-nums"
              style={{ color: 'rgb(var(--term-text))', background: 'rgb(var(--term-bg))' }}>{fontSize}</span>
            <button onClick={() => setFontSize(f => Math.min(24, Math.max(10, f + 1)))} title="Крупнее"
              className="px-1.5 py-1 text-sm font-semibold"
              style={{ color: 'rgb(var(--term-text))', background: 'rgb(var(--term-bg))' }}>+</button>
          </div>
          {allShells.length > 1 && (
            <select
              value={allShells.includes(session) ? session : ''}
              onChange={(e) => { if (e.target.value) connect(dir, false, e.target.value) }}
              title="Переключить сессию шелла"
              className="px-1 py-1 rounded border text-[11px] shrink-0 max-w-[6.5rem]"
              style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>
              {allShells.map((s, i) => (
                <option key={s} value={s}>{i === 0 ? 'шелл 1' : `шелл ${i + 1}`}</option>
              ))}
            </select>
          )}
          <button onClick={() => connect(dir, true)} title="Новая сессия шелла"
            className="px-2 py-1 rounded border shrink-0"
            style={{ color: 'rgb(var(--term-text))', borderColor: 'rgb(var(--term-border))', background: 'rgb(var(--term-bg))' }}>
            +
          </button>
        </div>
      </div>

      {err && (
        <div className="px-3 py-1.5 text-[11px] text-danger shrink-0"
          style={{ borderBottom: '1px solid rgb(var(--term-border))' }}>{err}</div>
      )}

      <div ref={hostRef} className="flex-1 min-h-0 px-2 py-1 overflow-hidden"
        onPointerDown={() => { try { termRef.current?.focus() } catch {} }} />

      {keypad && <TermKeypad onSend={send} />}
    </div>
  )
}