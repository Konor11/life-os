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
// Причина последнего аварийного перехода на xterm. Без неё «активен xterm» выглядит как
// настройка, хотя на самом деле ghostty просто не поднялся и надо знать, почему.
export const FALLBACK_KEY = 'lifeos.chat.term.fallback'

export function lastFallbackReason() {
  try { return window.localStorage.getItem(FALLBACK_KEY) || '' } catch { return '' }
}

export function clearFallback() {
  try { window.localStorage.removeItem(FALLBACK_KEY) } catch {}
}

export function preferredEngine() {
  try {
    const q = new URLSearchParams(window.location.search).get('term')
    if (q === 'xterm' || q === 'ghostty') return q
    const s = window.localStorage.getItem(TERM_KEY)
    if (s === 'xterm' || s === 'ghostty') return s
  } catch { /* приватный режим и т.п. */ }
  // По умолчанию — xterm.js с DOM-рендерером (БЕЗ WebGL): текст рисуется настоящими
  // DOM-элементами, и Android выделяет его нативно (ручки, «Копировать»). WebGL/canvas
  // этого не дают — там пиксели. ghostty остаётся опцией для скорости, но без нативного
  // копирования.
  return 'xterm'
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
  // Unicode: сначала graphemes (правильная ширина сложных эмодзи, флагов, ZWJ — это была
  // боль: эмодзи считались шириной 2 и съезжали). Если он не поднялся — unicode11 как запасной.
  // graphemes ЭКСПЕРИМЕНТАЛЬНЫЙ (README предупреждает), но для эмодзи это единственный честный
  // путь. activeVersion переключаем на 'grapheme' только при успехе.
  try {
    import('@xterm/addon-unicode-graphemes').then(({ UnicodeGraphemesAddon }) => {
      term.loadAddon(new UnicodeGraphemesAddon())
      try { term.unicode.activeVersion = 'grapheme' } catch {
        // graphemes не зарегистрировал версию — оставляем unicode11
        import('@xterm/addon-unicode11').then(({ Unicode11Addon }) => {
          term.loadAddon(new Unicode11Addon())
          term.unicode.activeVersion = '11'
        }).catch(() => {})
      }
    }).catch(() => {
      // graphemes не загрузился вовсе — unicode11
      import('@xterm/addon-unicode11').then(({ Unicode11Addon }) => {
        term.loadAddon(new Unicode11Addon())
        term.unicode.activeVersion = '11'
      }).catch(() => {})
    })
  } catch {}
  // --- Аддоны. Грузим динамически и по одному: если какой-то не поднялся (нет GPU, старый
  // браузер), терминал обязан работать дальше — аддон не критичен для самого рендера.
  let search = null, serialize = null, webgl = null
  // Поиск по выводу (Ctrl+F в UI). Полезно: в TUI много текста, искать нечем.
  try {
    import('@xterm/addon-search').then(({ SearchAddon }) => {
      search = new SearchAddon(); term.loadAddon(search)
    }).catch(() => {})
  } catch {}
  // Сериализация буфера в VT-поток: пригодится, чтобы отрисовать экран заново после
  // переподключения (вместо сырогого реплея хвоста, который рвёт кадр).
  try {
    import('@xterm/addon-serialize').then(({ SerializeAddon }) => {
      serialize = new SerializeAddon(); term.loadAddon(serialize)
    }).catch(() => {})
  } catch {}
  // Кликабельные ссылки: в выводе агентов много URL.
  try {
    import('@xterm/addon-web-links').then(({ WebLinksAddon }) => {
      term.loadAddon(new WebLinksAddon())
    }).catch(() => {})
  } catch {}
  // Прогресс операций: слушает OSC 9;4 (ConEmu) и поднимает индикатор прогресса во вкладке/
  // статусе ОС. Видно, что долгая задача агента идёт — НО только если само приложение шлёт
  // эту последовательность. Безвреден, если не шлёт.
  try {
    import('@xterm/addon-progress').then(({ ProgressAddon }) => {
      term.loadAddon(new ProgressAddon())
    }).catch(() => {})
  } catch {}
  term.open(el)
  el.style.background = theme.background
  // === WebGL: GPU-ускоренный рендер ===
  // Текст на canvas НЕ выделяется нативно — это ограничение xterm.js на touch-устройствах
  // (issues #5377, #3727, #1101 — upstream не решён). Поэтому для копирования/вставки на
  // телефоне ниже есть long-press overlay: терминал-текст в настоящей textarea, где
  // Android выделяет нативно (см. hermes-agent issue #50075 — такой же баг, такое же решение).
  // WebGL при этом работает: буфер текста доступен через term.buffer независимо от рендерера.
  try {
    import('@xterm/addon-webgl').then(({ WebglAddon }) => {
      try {
        webgl = new WebglAddon()
        webgl.onContextLoss(() => { try { webgl.dispose() } catch {} ; webgl = null })
        term.loadAddon(webgl)
      } catch { /* нет GPU — DOM-рендер */ }
    }).catch(() => {})
  } catch {}
  // === Long-press → overlay с текстом экрана (нативное копирование) ===
  // При долгом нажатии открывается textarea с текстом терминала (read-only).
  // Android выделяет её нативно (ручки, «Копировать/Выбрать всё»). Это РЕШЕНИЕ проблемы
  // touch-выделения в xterm.js — canvas/WebGL не выделяется ОС (см. upstream #5377).
  // Для вставки — кнопка «📋 Вставить» (clipboard API, жест = разрешение).
  {
    let overlay = null, longPressTimer = null
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (isTouch) {
      const openOverlay = () => {
        if (overlay) return
        // собираем видимый текст экрана из буфера
        const buf = term.buffer.active
        const lines = []
        const base = buf.baseY
        for (let r = 0; r < term.rows; r++) {
          const line = buf.getLine(base + r)
          try { lines.push(line ? line.translateToString(true) : '') } catch { lines.push('') }
        }
        overlay = document.createElement('div')
        overlay.style.cssText = 'position:absolute;inset:0;z-index:40;overflow:auto;' +
          'padding:8px 6px 52px;background:' + (theme.background || '#0b0e14') + ';' +
          'display:flex;flex-direction:column;'
        // заголовок с кнопками
        const bar = document.createElement('div')
        bar.style.cssText = 'display:flex;gap:6px;padding:4px 6px;margin-bottom:6px;flex-shrink:0;'
        // кнопка Copy all
        const copyBtn = document.createElement('button')
        copyBtn.textContent = '📋 Всё'
        copyBtn.style.cssText = 'padding:4px 10px;border-radius:6px;border:1px solid rgba(128,128,128,.4);' +
          'background:rgba(28,30,36,.95);color:#fff;font-size:13px;cursor:pointer'
        const screenText = lines.join('\n')
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(screenText)
            copyBtn.textContent = '✓'
            setTimeout(() => copyBtn.textContent = '📋 Всё', 1200)
          } catch {}
        }
        bar.appendChild(copyBtn)
        // кнопка Вставить
        const pasteBtn = document.createElement('button')
        pasteBtn.textContent = '📥 Вставить'
        pasteBtn.style.cssText = 'padding:4px 10px;border-radius:6px;border:1px solid rgba(128,128,128,.4);' +
          'background:rgba(28,30,36,.95);color:#fff;font-size:13px;cursor:pointer'
        pasteBtn.onclick = async () => {
          try {
            const text = await navigator.clipboard.readText()
            if (text) term.paste(text)
          } catch (e) {
            pasteBtn.textContent = '⚠'
            setTimeout(() => pasteBtn.textContent = '📥 Вставить', 1200)
          }
        }
        bar.appendChild(pasteBtn)
        // кнопка закрыть
        const closeBtn = document.createElement('button')
        closeBtn.textContent = '✕'
        closeBtn.style.cssText = 'padding:4px 10px;border-radius:6px;border:1px solid rgba(128,128,128,.4);' +
          'background:rgba(28,30,36,.95);color:#fff;font-size:13px;cursor:pointer;margin-left:auto'
        closeBtn.onclick = () => { try { overlay.remove() } catch {} ; overlay = null }
        bar.appendChild(closeBtn)
        overlay.appendChild(bar)
        // textarea с текстом (нативное выделение)
        // textarea с white-space:pre — НЕ pre-wrap: перенос строк уже в тексте
        // (translateToString(true) тримит хвосты, рамки целы), а при wrap длинные строки
        // рвутся и ASCII-рамки разваливаются (жалоба: «таблица ломается»).
        // Горизонтальный скролл — единственный честный путь для широких терминалов.
        const taWrap = document.createElement('div')
        taWrap.style.cssText = 'flex:1;overflow:auto;'
        const ta = document.createElement('textarea')
        ta.value = screenText
        ta.readOnly = true
        ta.spellcheck = false
        ta.style.cssText = 'width:100%;height:100%;border:0;outline:0;resize:none;' +
          'background:transparent;color:' + (theme.foreground || '#e6edf3') + ';' +
          'font-family:monospace;font-size:' + (fontSize || 11) + 'px;line-height:1.2;' +
          'white-space:pre;overflow:auto;wrap:"off";' +
          'padding:4px 6px;user-select:text;-webkit-user-select:text;'
        taWrap.appendChild(ta)
        overlay.appendChild(taWrap)
        try { el.style.position = el.style.position || 'relative' } catch {}
        el.appendChild(overlay)
      }
      // long-press: >500мс без движения
      el.addEventListener('touchstart', (ev) => {
        if (ev.touches.length !== 1 || overlay) return
        ev.preventDefault()
        const sx = ev.touches[0].clientX, sy = ev.touches[0].clientY
        try { term.focus() } catch {}
        longPressTimer = setTimeout(() => openOverlay(), 500)
        const clear = () => {
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
        }
        const onMove = (e) => {
          if (Math.hypot(e.touches[0].clientX - sx, e.touches[0].clientY - sy) > 6) clear()
        }
        el.addEventListener('touchmove', onMove, { once: true, passive: true })
        el.addEventListener('touchend', () => { clear() }, { once: true, capture: true })
        el.addEventListener('touchcancel', () => { clear() }, { once: true, capture: true })
      }, { capture: true, passive: false })
    }
  }
  term.whenReady = (cb) => { try { cb() } catch {} }
  return {
    term, fit, kind: 'xterm',
    // наружу — чтобы UI мог дёрнуть поиск/сериализацию, не зная про аддоны
    getSearch: () => search,
    getSerialize: () => serialize,
    hasWebgl: () => !!webgl,
  }
}

function ghosttyEngine(args) {
  const { el, scrollback, cols, rows, onFallback } = args
  let fontSize = args.fontSize
  let theme = args.theme
  const resizeListeners = new Set()
  // Слушатели ввода регистрируются ДО загрузки ядра (ChatPanel вешает onData сразу) —
  // держим их в наборе и подключаем ОДИН транслятор к обёртке, когда она родится.
  const dataListeners = new Set()
  let t = null, fitAddon = null, disposed = false, ready = false
  let pendingWrites = []
  let size = { cols, rows }
  const readyCbs = []

  const fire = () => { ready = true; for (const cb of readyCbs.splice(0)) { try { cb() } catch {} } }
  const notifyResize = () => {
    if (!t) return
    if (t.cols === size.cols && t.rows === size.rows) return
    size = { cols: t.cols, rows: t.rows }
    for (const cb of resizeListeners) { try { cb({ cols: t.cols, rows: t.rows }) } catch {} }
  }

  // Long-press по терминалу → overlay с НАСТОЯЩИМ DOM-текстом экрана → нативное
  // выделение Android (ручки, системное «Копировать/Выбрать всё»). Canvas пиксели
  // выделить нативно нельзя — единственный путь: собрать текст из буфера в реальный div.
  // Тап (короткий) → фокус клавиатуры. Вставка — textarea обёртки внизу (native paste).
  let selectOverlay = null, longPressTimer = null, touchStartPos = null
  const enterSelectMode = () => {
    if (selectOverlay || !t) return
    try { el.style.position = el.style.position || 'relative' } catch {}
    const b = t.buffer && t.buffer.active
    const lines = []
    if (b) {
      const start = Math.max(0, (b.length || t.rows) - t.rows - (b.viewportY || 0))
      for (let r = 0; r < t.rows; r++) {
        const line = b.getLine(start + r)
        try { lines.push(line ? line.translateToString(true) : '') } catch { lines.push('') }
      }
    }
    selectOverlay = document.createElement('div')
    selectOverlay.style.cssText =
      'position:absolute;inset:0;z-index:40;overflow:auto;padding:12px 8px 40px;' +
      'background:' + (theme.background || '#0b0e14') + ';color:' + (theme.foreground || '#e6edf3') + ';' +
      'font-family:monospace;font-size:' + fontSize + 'px;line-height:1.15;white-space:pre-wrap;' +
      'word-break:break-all;-webkit-user-select:text;user-select:text;' +
      '-webkit-touch-callout:default;-webkit-user-modify:read-only'
    selectOverlay.textContent = lines.join('\n')
    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕'
    closeBtn.style.cssText = 'position:absolute;right:6px;top:6px;z-index:41;padding:4px 8px;' +
      'border-radius:6px;border:1px solid rgba(128,128,128,.4);background:rgba(28,30,36,.95);' +
      'color:#fff;font-size:13px;cursor:pointer'
    closeBtn.addEventListener('click', () => { try { selectOverlay.remove() } catch {} ; selectOverlay = null })
    selectOverlay.appendChild(closeBtn)
    el.appendChild(selectOverlay)
  }

  ;(async () => {
    const mod = await import('ghostty-web')
    let ghostty = null
    try { ghostty = await mod.Ghostty.load('/ghostty-vt.wasm') } catch (e1) { ghostty = await mod.Ghostty.load() }
    if (disposed) return
    try { el.innerHTML = '' } catch {}
    t = new mod.Terminal({
      fontSize, fontFamily: 'monospace', cursorBlink: false, theme,
      scrollback: scrollback || 2000, cols: size.cols, rows: size.rows, ghostty,
    })
    t.open(el)
    // ввод: единый транслятор из обёртки в наших слушателей
    try { t.onData((d) => { for (const cb of dataListeners) { try { cb(d) } catch {} } }) } catch {}
    // выделение обёртки → нативное копирование (onSelectionChange → нативно не работает на
    // canvas, поэтому нативное выделение даёт long-press overlay выше; тут только для десктопа)
    try { t.onResize(({ cols, rows }) => {
      size = { cols, rows }
      for (const cb of resizeListeners) { try { cb({ cols, rows }) } catch {} }
    }) } catch {}
    // отложенные записи
    for (const chunk of pendingWrites) { try { t.write(chunk) } catch {} }
    pendingWrites = []
    // FitAddon
    try {
      fitAddon = new mod.FitAddon()
      t.loadAddon(fitAddon)
      fitAddon.fit()
    } catch (e) { try { console.warn('[tui] FitAddon:', e) } catch {} }
    el.dataset.termEngine = 'ghostty'
    notifyResize()
    fire()
    for (const d of [60, 300, 1000, 2500]) setTimeout(() => {
      if (!disposed && fitAddon) { try { fitAddon.fit() } catch {} }
    }, d)
    // textarea обёртки — ОДИН раз ставим CSS (без MutationObserver: он зацикливался,
    // потому что обёртка переписывает style на mousemove → observer → cssText → observer...).
    // Ставим полосу внизу для нативной вставки (long-press → «Вставить»).
    const ta = t.textarea || el.querySelector('textarea')
    if (ta) {
      ta.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:36px;' +
        'opacity:0.02;z-index:6;border:0;outline:0;resize:none;padding:0;margin:0;' +
        'background:transparent;color:transparent;font-size:16px;caret-color:transparent'
    }
    // canvas: long-press → нативное выделение (overlay), короткий тап → фокус
    const cnv = el.querySelector('canvas')
    if (cnv) {
      cnv.addEventListener('touchstart', (ev) => {
        if (ev.touches.length !== 1 || selectOverlay) return
        ev.preventDefault()
        touchStartPos = { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
        try { t.focus() } catch {}
        longPressTimer = setTimeout(() => {
          if (touchStartPos) { touchStartPos = null; enterSelectMode() }
        }, 500)
      }, { capture: true, passive: false })
      cnv.addEventListener('touchmove', () => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
        touchStartPos = null
      }, { capture: true, passive: true })
      cnv.addEventListener('touchend', () => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
        touchStartPos = null
      }, { capture: true })
    }
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
        // options у обёртки — Proxy: смена fontSize дёргает renderer.setFontSize сам
        set fontSize(n) {
          fontSize = n
          if (t) { try { t.options.fontSize = n } catch {}; try { fitAddon && fitAddon.fit() } catch {} }
        },
        get theme() { return theme },
        // theme после open() официально «не полностью поддержан» — дожимаем через
        // renderer.setTheme (приватное поле, но обёрнуто в try/catch)
        set theme(th) {
          theme = th
          if (t) {
            try { t.options.theme = th } catch {}
            try { if (t.renderer && t.renderer.setTheme) t.renderer.setTheme(th) } catch {}
          }
        },
      },
      write(d) { if (t) { try { t.write(d) } catch {} } else pendingWrites.push(d) },
      writeln(d) { this.write((d || '') + '\r\n') },
      refresh() {},
      clear() { if (t) { try { t.clear() } catch {} } },
      reset() { if (t) { try { t.reset() } catch {} } },
      focus() { try { t && t.focus() } catch {} },
      open() {}, loadAddon() {},
      dispose() {
        disposed = true
        try { selectOverlay && selectOverlay.remove() } catch {}
        selectOverlay = null
        try { t && t.dispose() } catch {}
        t = null; fitAddon = null
      },
      onData(fn) { dataListeners.add(fn); return { dispose: () => dataListeners.delete(fn) } },
      onResize(fn) { resizeListeners.add(fn); return { dispose: () => resizeListeners.delete(fn) } },
      getSelection() { try { return t && t.getSelection ? t.getSelection() : '' } catch { return '' } },
    },
    fit: {
      fit() { if (fitAddon) { try { fitAddon.fit() } catch {} } },
      proposeDimensions() {
        if (fitAddon) { try { const p = fitAddon.proposeDimensions(); if (p) return p } catch {} }
        return { cols: size.cols, rows: size.rows }
      },
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
      // Причину запоминаем отдельно: иначе «активен xterm» неотличим от сознательного выбора.
      try { console.warn('[tui] ghostty недоступен, переходим на xterm.js:', why) } catch {}
      try { window.localStorage.setItem(FALLBACK_KEY, String(why || 'причина неизвестна').slice(0, 300)) } catch {}
      setPreferredEngine('xterm')
      try { args.el.innerHTML = '' } catch {}
      const fallback = xtermEngine(args)
      args.el.dataset.termEngine = 'xterm'
      args.onFallbackReady && args.onFallbackReady(fallback)
    },
  }))
}
