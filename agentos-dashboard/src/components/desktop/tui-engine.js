/**
 * Адаптер терминального движка для вкладки Chat.
 *
 * Попробовать другой движок (вариант B) предложил пользователь: xterm.js — это JS-реализация
 * терминала, а rioterm — VT-ядро Rio (librio), скомпилированное в WebAssembly, то же самое, что
 * работает в десктопном Rio. Почему он может быть лучше в нашем случае:
 *   • librio сам реализует ESC[?2026 (synchronized output) — в xterm.js мигал viewport именно
 *     в этом режиме, а TUI Hermes перерисовывает кадр целиком и синхронизацией пользуется;
 *   • `fit: true` — движок сам следит за размером контейнера и пересчитывает сетку, поэтому
 *     FitAddon, ResizeObserver и наши костыли с размерами не нужны;
 *   • `serialize()` — весь буфер как VT-поток: восстановление экрана при переподключении без
 *     реплея хвоста сырого PTY-буфера (который начинается с середины escape-последовательности);
 *   • `predictiveEcho` — mosh-подобный локальный эхо-вывод для медленной связи.
 *
 * Наружу адаптер отдаёт ПОВЕРХНОСТЬ xterm.js (cols/rows/options/write/onData/onResize/refresh/
 * clear/focus/dispose + аддон fit), чтобы логика WS/PTY/клавиатуры в ChatPanel не менялась и оба
 * движка шли по одному и тому же коду. Это осознанный компромисс: меньше правок в рабочем пути.
 *
 * Переключение: localStorage `lifeos.chat.term` = 'rio' | 'xterm' (по умолчанию 'rio'),
 * либо `?term=xterm` в адресе. Если rioterm не загрузился (wasm/сеть) — молча падаем на xterm.
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export const TERM_KEY = 'lifeos.chat.term'

export function preferredEngine() {
  try {
    const q = new URLSearchParams(window.location.search).get('term')
    if (q === 'xterm' || q === 'rio') return q
    const s = window.localStorage.getItem(TERM_KEY)
    if (s === 'xterm' || s === 'rio') return s
  } catch { /* приватный режим и т.п. */ }
  return 'rio'
}

export function setPreferredEngine(kind) {
  try { window.localStorage.setItem(TERM_KEY, kind) } catch {}
}

// rioterm ждёт полную схему из 20 цветов; наш xterm-тема содержит все нужные поля.
function rioTheme(t) {
  const sel = t.selectionBackground || 'rgba(88,101,242,0.35)'
  return {
    foreground: t.foreground, background: t.background, cursor: t.cursor || t.foreground,
    selectionForeground: t.background, selectionBackground: sel,
    black: t.black, red: t.red, green: t.green, yellow: t.yellow,
    blue: t.blue, magenta: t.magenta, cyan: t.cyan, white: t.white,
    brightBlack: t.brightBlack, brightRed: t.brightRed, brightGreen: t.brightGreen,
    brightYellow: t.brightYellow, brightBlue: t.brightBlue, brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan, brightWhite: t.brightWhite,
  }
}

function xtermEngine({ el, fontSize, theme, scrollback, cols, rows }) {
  const term = new Terminal({
    cursorBlink: false,   // мигающий блок-курсор на тёмном экране = вспышка каждые ~600 мс
    fontSize, lineHeight: 1, fontFamily: 'monospace', theme, scrollback, cols, rows,
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  // Unicode 11: opencode/hermes v2 рисуют эмодзи и считают ширину как string-width (эмодзи = 2).
  try {
    import('@xterm/addon-unicode11').then(({ Unicode11Addon }) => {
      term.loadAddon(new Unicode11Addon())
      term.unicode.activeVersion = '11'
    }).catch(() => {})
  } catch {}
  term.open(el)
  el.style.background = theme.background
  return { term, fit, kind: 'xterm' }
}

// rioterm — фасад с поверхностью xterm.js. Сам rioterm открывается асинхронно (грузится wasm),
// поэтому всё, что происходит до готовности, кладём в очередь и проигрываем при открытии.
function rioEngine({ el, fontSize, theme, scrollback, cols, rows, onFallback }) {
  const dataListeners = new Set()
  const resizeListeners = new Set()
  const decoder = new TextDecoder()
  let handle = null, disposed = false, pendingWrites = []
  let size = { cols, rows }
  let opts = { fontSize, theme: rioTheme(theme), scrollback, cols, rows }

  const notifyResize = () => {
    if (!handle) return
    const c = handle.terminal.cols, r = handle.terminal.rows
    if (c === size.cols && r === size.rows) return
    size = { cols: c, rows: r }
    for (const cb of resizeListeners) { try { cb({ cols: c, rows: r }) } catch {} }
  }

  const start = async () => {
    const { open } = await import('rioterm')
    const h = await open(el, {
      renderer: 'canvas', fontFamily: 'monospace', fontSize: opts.fontSize, lineHeight: 1,
      theme: opts.theme, scrollback: opts.scrollback, cols: opts.cols, rows: opts.rows,
      fit: true, autoFocus: false,
    })
    if (disposed) { try { h.dispose() } catch {} ; return }
    handle = h
    el.dataset.termEngine = 'rio'
    // Движок сам ресайзит сетку по контейнеру — события размера берём из его обновлений.
    h.terminal.onUpdate(() => notifyResize())
    h.terminal.onData((bytes) => {
      const s = decoder.decode(bytes, { stream: true })
      for (const cb of dataListeners) { try { cb(s) } catch {} }
    })
    for (const chunk of pendingWrites) { try { h.terminal.write(chunk) } catch {} }
    pendingWrites = []
    size = { cols: h.terminal.cols, rows: h.terminal.rows }
    notifyResize()
  }

  start().catch((e) => {
    // rioterm не поднялся (нет wasm/сеть/старый браузер) — возвращаем рабочий xterm.
    if (!disposed) { try { onFallback && onFallback(String(e && e.message || e)) } catch {} }
  })
  if (typeof window !== 'undefined') {
    const t = setInterval(notifyResize, 300)   // страховка: fit внутри rioterm без событий
    const stop = () => clearInterval(t)
    el.__rioStop = stop
  }

  return {
    term: {
      get cols() { return handle ? handle.terminal.cols : size.cols },
      get rows() { return handle ? handle.terminal.rows : size.rows },
      options: {
        get fontSize() { return opts.fontSize },
        set fontSize(n) { if (n !== opts.fontSize) recreate({ fontSize: n }) },
        get theme() { return opts.theme },
        set theme(t) { recreate({ theme: rioTheme(t) }) },
      },
      write(d) { if (handle) { try { handle.terminal.write(d) } catch {} } else pendingWrites.push(d) },
      writeln(d) { this.write((d || '') + '\r\n') },
      refresh() { try { handle && handle.renderer.schedule() } catch {} },
      clear() { this.write('\x1b[2J\x1b[H') },
      reset() { this.write('\x1b[2J\x1b[H') },
      focus() { try { handle && handle.focus() } catch {} },
      open() {}, loadAddon() {}, dispose() {
        disposed = true
        try { el.__rioStop && el.__rioStop() } catch {}
        try { handle && handle.dispose() } catch {}
        handle = null
      },
      onData(fn) { dataListeners.add(fn); return { dispose: () => dataListeners.delete(fn) } },
      onResize(fn) { resizeListeners.add(fn); return { dispose: () => resizeListeners.delete(fn) } },
      getSelection() { try { return handle ? handle.terminal.getSelection() : '' } catch { return '' } },
      serialize() { try { return handle ? handle.terminal.serialize() : '' } catch { return '' } },
    },
    fit: { fit() {}, proposeDimensions() { return { cols: size.cols, rows: size.rows } } },
    kind: 'rio',
  }

  // Смена кегля или темы: у rioterm нет рантайм-сеттеров, поэтому пересоздаём движок, сохранив
  // содержимое через serialize() — экран и история остаются на месте, соединение с PTY не рвётся.
  async function recreate(next) {
    const saved = (handle && !disposed) ? (() => { try { return handle.terminal.serialize() } catch { return '' } })() : ''
    opts = { ...opts, ...next }
    if (handle) { try { handle.dispose() } catch {} ; handle = null }
    try { el.innerHTML = '' } catch {}
    try { await start() } catch {}
    if (saved && handle) { try { handle.terminal.write(saved) } catch {} }
  }
}

export function createTuiEngine(args) {
  const kind = preferredEngine()
  if (kind === 'xterm') return xtermEngine(args)
  try {
    return rioEngine({
      ...args,
      onFallback: (why) => {
        // Пользователь просил попробовать rioterm; если он не поднялся — сообщаем и работаем на xterm.
        try { console.warn('[tui] rioterm недоступен, переходим на xterm.js:', why) } catch {}
        setPreferredEngine('xterm')
        try { args.el.innerHTML = '' } catch {}
        const fallback = xtermEngine(args)
        args.el.dataset.termEngine = 'xterm'
        args.onFallbackReady && args.onFallbackReady(fallback)
      },
    })
  } catch (e) {
    try { console.warn('[tui] rioterm не создался, используем xterm.js:', e) } catch {}
    return xtermEngine(args)
  }
}
