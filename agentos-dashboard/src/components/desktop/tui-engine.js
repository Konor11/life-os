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
    if (q === 'xterm' || q === 'rio' || q === 'ghostty') return q
    const s = window.localStorage.getItem(TERM_KEY)
    if (s === 'xterm' || s === 'rio' || s === 'ghostty') return s
  } catch { /* приватный режим и т.п. */ }
  // По умолчанию — xterm.js. rioterm (вариант B) работает и включён одной кнопкой в тулбаре
  // (или ?term=rio), но у него воспроизводится пустой канвас: движок поднимается, размеры и
  // ошибки в норме, а renderer иногда не рисует вообще (средняя яркость канваса 253/255, то есть
  // не закрашено даже фон). Пока это не вылечено, дефолтом оставляем проверенный xterm.
  return 'xterm'
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
  // xterm готов сразу: интерфейс ChatPanel одинаков для обоих движков.
  term.whenReady = (cb) => { try { cb() } catch {} }
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
  let scheduleReady = null
  let opts = { fontSize, theme: rioTheme(theme), scrollback, cols, rows }

  const notifyResize = () => {
    if (!handle) return
    const c = handle.terminal.options.cols, r = handle.terminal.options.rows
    if (c === size.cols && r === size.rows) return
    size = { cols: c, rows: r }
    for (const cb of resizeListeners) { try { cb({ cols: c, rows: r }) } catch {} }
  }

  // Отрисовка канваса. rioterm сам планирует кадр по onUpdate, но на практике канвас оставался
  // пустым (средняя яркость 246-254, то есть не закрашен даже фон), хотя буфер полон: в замере
  // dump() отдавал 41 703 символа с баннером, а рисовалось ноль. Причина — метрики знакоместа:
  // если контейнер на момент open() не разложен, cellWidth/cellHeight нулевые и рисовать нечего
  // (canvas пустой при верных cols/rows). Лечится явным fit() по фактическому размеру контейнера
  // ПОСЛЕ раскладки — render() дёргать нельзя, он ломает собственное планирование кадров rioterm.
  const refit = () => {
    if (!handle) return
    try {
      const w = el.clientWidth, h = el.clientHeight
      if (w > 0 && h > 0) handle.renderer.fit(w, h)
    } catch {}
    try { handle.renderer.schedule() } catch {}
  }

  const start = async () => {
    const { open } = await import('rioterm')
    // Перед открытием убираем канвас прошлого инстанса: эффект ChatPanel может перезапуститься
    // (тулбар Web/TUI, смена профиля), и два канваса в одном контейнере оставляли видимым пустой.
    try { el.innerHTML = '' } catch {}
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
    size = { cols: h.terminal.options.cols, rows: h.terminal.options.rows }
    el.__rio = h          // ручка для диагностики из браузера (канвас/дамп буфера)
    notifyResize()
    // Кадр просим сразу и ещё раз после раскладки: если контейнер в момент open() был не
    // отрисован, канвас остаётся пустым до следующей записи вывода.
    refit()
    for (const delay of [60, 300, 1000, 2500]) {
      setTimeout(() => { if (!disposed) refit() }, delay)
    }
    scheduleReady && scheduleReady()
  }

  start().catch((e) => {
    // rioterm не поднялся (нет wasm/сеть/старый браузер) — возвращаем рабочий xterm.
    if (!disposed) { try { onFallback && onFallback(String(e && e.message || e)) } catch {} }
  })
  if (typeof window !== 'undefined') {
    // Раз в 300 мс: следим за размером (страховка, если fit внутри rioterm не поднял onUpdate) и
    // за тем, что канвас вообще закрашен — пустой терминал пользователю хуже лишнего кадра.
    const t = setInterval(() => {
      notifyResize()
      if (!handle) return
      try {
        const cv = el.querySelector('canvas')
        const g = cv && cv.getContext('2d')
        if (!g) return
        const n = 24
        const d = g.getImageData(0, 0, Math.min(n, cv.width), Math.min(n, cv.height)).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]
        const avg = sum / (d.length / 4) / 3
        const bg = opts.theme && opts.theme.background ? opts.theme.background : '#000000'
        const m = /^#(..)(..)(..)$/.exec(bg)
        const want = m ? (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / 3 - 26 : 0
        // Канвас белый (не закрашен даже фон) — значит рендерер не нарисовал кадр.
        if (avg > 240 && avg > want + 60) refit()
      } catch { /* getImageData может быть недоступен — не критично */ }
    }, 300)
    const stop = () => clearInterval(t)
    el.__rioStop = stop
  }

  // Готовность движка (см. whenReady ниже): rioterm поднимается после загрузки wasm.
  const readyCallbacks = []
  let isReady = false
  scheduleReady = () => {
    isReady = true
    const cbs = readyCallbacks.splice(0)
    for (const cb of cbs) { try { cb() } catch {} }
  }

  return {
    term: {
      // У rioterm нет свойств cols/rows на Terminal — размеры лежат в options (см. TerminalOptions
      // в типах пакета). Пока wasm не поднялся, отдаём ожидаемый размер.
      get cols() { return handle ? handle.terminal.options.cols : size.cols },
      get rows() { return handle ? handle.terminal.options.rows : size.rows },
      // Готовность движка: xterm готов сразу, rioterm — после загрузки wasm. ChatPanel вешает
      // подключение к PTY на это событие, иначе сокет открылся бы с размерами-заглушкой (120x40),
      // и PTY родился бы не в том размере.
      whenReady(cb) { if (isReady) { try { cb() } catch {} } else readyCallbacks.push(cb) },
      options: {
        get fontSize() { return opts.fontSize },
        set fontSize(n) { if (n !== opts.fontSize) recreate({ fontSize: n }) },
        get theme() { return opts.theme },
        set theme(t) { recreate({ theme: rioTheme(t) }) },
      },
      write(d) {
        if (handle) {
          try { handle.terminal.write(d) } catch {}
          // Кадр планирует сам rioterm по onUpdate; нам достаточно держать актуальный fit, если
          // контейнер менял размер без его ведома.
          try { handle.renderer.schedule() } catch {}
        } else pendingWrites.push(d)
      },
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

// ghostty — VT-ядро Ghostty (libghostty-vt) через WebAssembly, npm `ghostty-web`. Библиотека ниже
// уровнем, чем xterm.js: сам эмулятор (GhosttyTerminal), канвас-рендерер и обработчик ввода
// собираются руками. Наружу — та же поверхность xterm.js, что у rioterm, и тот же путь отката.
// Отличие от rioterm: этот же терминал отвечает на запросы терминала (XTVERSION, цвет фона),
// которые Hermes-TUI сейчас шлёт в пустоту, — из-за молчания терминала он и путается с режимами.
function ghosttyEngine(args) {
  const { el, scrollback, cols, rows, onFallback } = args
  let fontSize = args.fontSize
  let theme = args.theme
  const dataListeners = new Set()
  const resizeListeners = new Set()
  let t = null, renderer = null, input = null, disposed = false, ready = false
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
    input = new mod.InputHandler(ghostty, el, (d) => {
      for (const cb of dataListeners) { try { cb(d) } catch {} }
    }, () => {})
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
    // Канвас у таких движков может остаться незакрашенным, если контейнер не был разложен в момент
    // создания (у rioterm это ловилось): просим кадр ещё несколько раз по мере раскладки.
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
      focus() { try { el.focus() } catch {} },
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
  if (kind === 'ghostty') {
    return remember(ghosttyEngine({
      ...args,
      onFallback: (why) => {
        try { console.warn('[tui] ghostty недоступен, переходим на xterm.js:', why) } catch {}
        setPreferredEngine('xterm')
        try { args.el.innerHTML = '' } catch {}
        const fallback = xtermEngine(args)
        args.el.dataset.termEngine = 'xterm'
        args.onFallbackReady && args.onFallbackReady(fallback)
      },
    }))
  }
  try {
    return remember(rioEngine({
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
    }))
  } catch (e) {
    try { console.warn('[tui] rioterm не создался, используем xterm.js:', e) } catch {}
    return xtermEngine(args)
  }
}
