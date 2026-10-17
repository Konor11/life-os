/**
 * Терминал вкладки Chat. Два движка: ghostty-web (по умолчанию) и xterm.js (запасной).
 *
 * ghostty-web — VT-ядро Ghostty через WebAssembly, компиляция canvas. Свежее и быстрее
 * xterm.js; переключатель в Настройках (localStorage `lifeos.chat.term` = 'ghostty' | 'xterm',
 * либо ?term=xterm в адресе). Если ядро не загрузилось (wasm/сеть/CSP) — молча падаем на xterm.
 *
 * Наружу адаптер отдаёт ПОВЕРХНОСТЬ xterm.js (cols/rows/options/write/onData/onResize/refresh/
 * clear/focus/dispose + аддон fit), чтобы логика WS/PTY/клавиатуры в ChatPanel не менялась и оба
 * движка шли по одному коду.
 *
 * Мобильный ввод — то, что пришлось лечить в сентябре, и зачем тут столько обвязки:
 *   • Android отдаёт ввод через IME/input, а не keydown: фокус обязан сидеть на textarea;
 *   • Gboard при автодополнении один символ уносил 2–3 раза — отдаём только event.data и
 *     молчим во время композиции IME;
 *   • Chromium при тапе фокусирует контейнер синтетическим mousedown ПОСЛЕ pointerup —
 *     потому фокус поднимаем в setTimeout(0) из трёх обработчиков;
 *   • движок без FitAddon: сетку считаем по метрикам шрифта и подгоняем ДО ready, чтобы PTY
 *     родился в правильном размере (иначе склеивалась нижняя панель).
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export const TERM_KEY = 'lifeos.chat.term'

export function preferredEngine() {
  try {
    const q = new URLSearchParams(window.location.search).get('term')
    if (q === 'xterm' || q === 'ghostty') return q
    const s = window.localStorage.getItem(TERM_KEY)
    if (s === 'xterm' || s === 'ghostty') return s
  } catch { /* приватный режим и т.п. */ }
  return 'ghostty'
}

export function setPreferredEngine(kind) {
  try { window.localStorage.setItem(TERM_KEY, kind) } catch {}
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
  term.whenReady = (cb) => { try { cb() } catch {} }
  return { term, fit, kind: 'xterm' }
}

function ghosttyEngine(args) {
  const { el, scrollback, cols, rows, onFallback } = args
  let fontSize = args.fontSize
  let theme = args.theme
  const dataListeners = new Set()
  const resizeListeners = new Set()
  let t = null, renderer = null, input = null, disposed = false, ready = false
  let sink = null
  let pendingWrites = []
  let size = { cols, rows }
  const readyCbs = []

  const fire = () => { ready = true; for (const cb of readyCbs.splice(0)) { try { cb() } catch {} } }
  const notifyResize = () => {
    if (!t) return
    const c = t.cols, r = t.rows
    if (c === size.cols && r === size.rows) return
    size = { cols: c, rows: r }
    for (const cb of resizeListeners) { try { cb({ cols: c, rows: r }) } catch {} }
  }
  const paint = (force) => {
    if (!t || !renderer || disposed) return
    let full = force === true
    try {
      const d = t.update()
      full = full || d === 'full' || t.needsFullRedraw()
    } catch {}
    try { renderer.render(t, full) } catch {}
    try { t.markClean() } catch {}
  }
  // Размер сетки считаем по контейнеру и метрикам шрифта: у ghostty нет FitAddon, как у xterm.js.
  const measureCell = () => {
    const c = document.createElement('canvas')
    const g = c.getContext('2d')
    g.font = fontSize + 'px monospace'
    return { w: Math.max(1, Math.round(g.measureText('M').width)), h: Math.max(1, Math.round(fontSize)) }
  }
  const propose = () => {
    const m = measureCell()
    return {
      cols: Math.max(20, Math.floor((el.clientWidth || m.w * 80) / m.w)),
      rows: Math.max(5, Math.floor((el.clientHeight || m.h * 24) / m.h)),
    }
  }
  const applyFit = () => {
    if (!t || !renderer || disposed) return
    const p = propose()
    if (p.cols !== t.cols || p.rows !== t.rows) {
      try { t.resize(p.cols, p.rows) } catch {}
      try { renderer.resize(p.cols, p.rows) } catch {}
      size = { cols: p.cols, rows: p.rows }
      notifyResize()
    } else {
      try { renderer.resize(t.cols, t.rows) } catch {}
    }
    paint(true)
  }
  const refit = () => {
    if (!t || !renderer) return
    try { renderer.remeasureFont() } catch {}
    applyFit()
  }

  ;(async () => {
    const mod = await import('ghostty-web')
    // Ядро грузим со своего домена: ghostty-web по умолчанию тянет wasm инлайновым data:-URL, а его
    // режет наш CSP (connect-src). Файл лежит в public/ghostty-vt.wasm и отдаётся с того же origin.
    let ghostty = null
    try { ghostty = await mod.Ghostty.load('/ghostty-vt.wasm') } catch (e1) { ghostty = await mod.Ghostty.load() }
    if (disposed) return
    try { el.innerHTML = '' } catch {}
    const canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    el.appendChild(canvas)
    t = ghostty.createTerminal(size.cols, size.rows, { scrollbackLimit: scrollback || 2000 })
    renderer = new mod.CanvasRenderer(canvas, {
      fontSize, fontFamily: 'monospace', cursorBlink: false, theme,
      devicePixelRatio: window.devicePixelRatio || 1,
    })
    // Ввод: свой приёмник — скрытый textarea (как .xterm-helper-textarea у xterm.js). Штатный
    // InputHandler слушает клавиши на контейнере, но Android отдаёт ввод через IME/input-события,
    // а не keydown: фокус на div клавиатуру не поднимает, и ввод теряется. textarea держит фокус и
    // IME, печатаемый текст берём из его input, служебные клавиши — из keydown.
    const emit = (d) => { for (const cb of dataListeners) { try { cb(d) } catch {} } }
    sink = document.createElement('textarea')
    sink.setAttribute('autocapitalize', 'off')
    sink.setAttribute('autocorrect', 'off')
    sink.setAttribute('spellcheck', 'false')
    sink.setAttribute('aria-label', 'terminal input')
    sink.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;margin:0;resize:none;outline:none'
    el.appendChild(sink)
    try { el.tabIndex = 0 } catch {}
    const SPECIAL = {
      Enter: '\r', Backspace: '\x7f', Tab: '\t', Escape: '\x1b',
      ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
      Home: '\x1b[H', End: '\x1b[F', Delete: '\x1b[3~', PageUp: '\x1b[5~', PageDown: '\x1b[6~',
    }
    // Ввод IME (Gboard с русской раскладкой и автозаменой). Прежняя версия отдавала ВСЁ содержимое
    // поля и сразу его очищала: Gboard переиспользовал своё предиктивное состояние и один символ
    // уходил 2-3 раза (в записи потока видно 'ж','ж' с разницей 1 мс, 'р','р','р' — так не печатают,
    // отсюда и «мусор» вроде длжжррроо в приглашении). Поэтому: отдаём только вставленный фрагмент
    // (event.data), а во время композиции IME вообще молчим — текст заберём по compositionend.
    let composing = false
    sink.addEventListener('compositionstart', () => { composing = true })
    sink.addEventListener('compositionend', (ev) => {
      composing = false
      const d = ev.data || sink.value
      sink.value = ''
      if (d) emit(d)
    })
    sink.addEventListener('input', (ev) => {
      if (composing || ev.isComposing) return
      const d = ev.data
      if (d) emit(d)
      else { const v = sink.value; if (v) emit(v) }
      sink.value = ''
    })
    sink.addEventListener('keydown', (ev) => {
      const k = ev.key
      if (ev.ctrlKey && k && k.length === 1) {
        const c = k.toLowerCase()
        if (c >= 'a' && c <= 'z') { emit(String.fromCharCode(c.charCodeAt(0) - 96)) ; ev.preventDefault() }
        return
      }
      if (SPECIAL[k]) { emit(SPECIAL[k]); ev.preventDefault() }
    })
    // Тап по терминалу поднимает клавиатуру: фокус обязан уйти в textarea внутри обработчика жеста.
    // Обработчиков три и все через setTimeout(0): Chromium при тапе фокусирует сам контейнер
    // (у него tabIndex=0) синтетическим mousedown, который приходит ПОСЛЕ pointerup, и одиночный
    // pointerup-обработчик проигрывал — фокус оставался на div и клавиатура не выезжала.
    const grabFocus = () => setTimeout(() => { try { sink.focus() } catch {} }, 0)
    el.addEventListener('pointerdown', grabFocus, { passive: true })
    el.addEventListener('pointerup', grabFocus, { passive: true })
    el.addEventListener('click', grabFocus, { passive: true })
    el.dataset.termEngine = 'ghostty'
    el.__ghostty = { t, renderer }
    for (const chunk of pendingWrites) { try { t.write(chunk) } catch {} }
    pendingWrites = []
    // Сначала подгоняем сетку под контейнер и только потом объявляем готовность: ChatPanel
    // подключает PTY на whenReady, и с размером-заглушкой (120x40) приложение родилось бы не в том
    // размере — ровно та ошибка, из-за которой раньше склеивалась нижняя панель.
    refit()
    notifyResize()
    fire()
    // Канвас может остаться незакрашенным, если контейнер не был разложен в момент создания:
    // просим кадр ещё несколько раз по мере раскладки.
    for (const d of [60, 300, 1000, 2500]) setTimeout(() => { if (!disposed) refit() }, d)
  })().catch((e) => {
    if (!disposed) { try { onFallback && onFallback(String((e && e.message) || e)) } catch {} }
  })

  return {
    term: {
      get cols() { return t ? t.cols : size.cols },
      get rows() { return t ? t.rows : size.rows },
      whenReady(cb) { if (ready) { try { cb() } catch {} } else readyCbs.push(cb) },
      options: {
        get fontSize() { return fontSize },
        set fontSize(n) { fontSize = n; refit() },
        get theme() { return theme },
        set theme(th) { theme = th; if (renderer) { try { renderer.theme = th } catch {} } refit() },
      },
      write(d) { if (t) { try { t.write(d) } catch {} ; paint(false) } else pendingWrites.push(d) },
      writeln(d) { this.write((d || '') + '\r\n') },
      refresh() { paint(true) },
      clear() { this.write('\x1b[2J\x1b[H') },
      reset() { this.write('\x1b[2J\x1b[H') },
      focus() { try { (sink || el).focus() } catch {} },
      open() {}, loadAddon() {},
      dispose() {
        disposed = true
        try { input && input.dispose && input.dispose() } catch {}
        try { t && t.free && t.free() } catch {}
        try { renderer && renderer.dispose && renderer.dispose() } catch {}
        t = null; renderer = null; input = null
      },
      onData(fn) { dataListeners.add(fn); return { dispose: () => dataListeners.delete(fn) } },
      onResize(fn) { resizeListeners.add(fn); return { dispose: () => resizeListeners.delete(fn) } },
      getSelection() { return '' },
    },
    fit: {
      fit() { applyFit() },
      proposeDimensions() { return t ? propose() : { cols: size.cols, rows: size.rows } },
    },
    kind: 'ghostty',
  }
}

// Один живой движок на контейнер. Эффект ChatPanel перезапускается (переключение Web/TUI, смена
// профиля, смена движка), и два инстанса в одном контейнере оставляли видимым пустой канвас.
const instances = new WeakMap()

export function createTuiEngine(args) {
  const prev = instances.get(args.el)
  if (prev) { try { prev.term.dispose() } catch {} ; instances.delete(args.el) }
  const remember = (e) => { try { instances.set(args.el, e) } catch {} ; return e }
  const kind = preferredEngine()
  if (kind === 'xterm') return remember(xtermEngine(args))
  return remember(ghosttyEngine({
    ...args,
    onFallback: (why) => {
      // ghostty не поднялся — сообщаем и работаем на xterm.js: терминал обязан быть живым.
      try { console.warn('[tui] ghostty недоступен, переходим на xterm.js:', why) } catch {}
      setPreferredEngine('xterm')
      try { args.el.innerHTML = '' } catch {}
      const fallback = xtermEngine(args)
      args.el.dataset.termEngine = 'xterm'
      args.onFallbackReady && args.onFallbackReady(fallback)
    },
  }))
}
