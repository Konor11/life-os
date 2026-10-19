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
  // WebGL-рендерер: ускоряет отрисовку крупных объёмов (TUI перерисовывает кадр целиком).
  // ВАЖНО: официального WebGPU-рендера у xterm.js НЕТ — WebGL2 и есть ускоренный путь.
  // Грузим ПОСЛЕ open() — иначе не подменит дефолтный DOM-рендер. При потере WebGL-контекста
  // (OOM, сон) — отпускаем аддон, xterm сам падает на DOM-рендер, терминал живёт дальше.
  try {
    import('@xterm/addon-webgl').then(({ WebglAddon }) => {
      try {
        webgl = new WebglAddon()
        webgl.onContextLoss(() => { try { webgl.dispose() } catch {} ; webgl = null })
        term.loadAddon(webgl)
      } catch { /* нет GPU — остаёмся на DOM-рендере */ }
    }).catch(() => {})
  } catch {}
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

  // ---- Кнопка «Скопировать» над терминалом, когда есть выделение ----
  // Canvas не даёт выделить текст руками браузера, поэтому выделение рисует сам
  // SelectionManager, а копирование в буфер — эта кнопка (жест клика = разрешение
  // navigator.clipboard). Появляется при непустом выделении, прячется при очистке.
  let copyBtn = null
  const ensureCopyBtn = () => {
    if (copyBtn || disposed) return
    copyBtn = document.createElement('button')
    copyBtn.textContent = '📋 Скопировать'
    copyBtn.style.cssText = 'position:absolute;right:10px;top:10px;z-index:20;padding:5px 12px;'
      + 'border-radius:8px;border:1px solid rgba(128,128,128,.45);background:rgba(28,30,36,.94);'
      + 'color:#fff;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)'
    try { el.style.position = el.style.position || 'relative' } catch {}
    el.appendChild(copyBtn)
    copyBtn.addEventListener('click', async () => {
      try {
        const sel = t && t.getSelection ? t.getSelection() : ''
        if (sel) {
          await navigator.clipboard.writeText(sel)
          copyBtn.textContent = '✓ Скопировано'
          setTimeout(() => { if (copyBtn) copyBtn.textContent = '📋 Скопировать' }, 1600)
        }
      } catch (e) { try { console.warn('[tui] копирование не удалось:', e && e.message || e) } catch {} }
    })
  }

  ;(async () => {
    const mod = await import('ghostty-web')
    // Ядро грузим со своего домена: инлайновый data:-URL режет CSP (connect-src).
    let ghostty = null
    try { ghostty = await mod.Ghostty.load('/ghostty-vt.wasm') } catch (e1) { ghostty = await mod.Ghostty.load() }
    if (disposed) return
    try { el.innerHTML = '' } catch {}
    // Официальная обёртка Terminal: внутри canvas+renderer, SelectionManager (выделение),
    // LinkDetector+UrlRegexProvider (кликабельные ссылки, включая OAuth-ссылки Google),
    // InputHandler с IME/вставкой и textarea-приёмником. Наш прежний ручной монтаж этих
    // частей заменён целиком — обёртка делает всё это сама и слаженнее.
    t = new mod.Terminal({
      fontSize, fontFamily: 'monospace', cursorBlink: false, theme,
      scrollback: scrollback || 2000, cols: size.cols, rows: size.rows, ghostty,
    })
    t.open(el)
    // --- Мост touch → mouse на canvas ---
    // Обёртка Terminal слушает mousedown/mousemove/mouseup для выделения. На Android
    // долгий тап по canvas перехватывается системой (меню «Автозаполнение»/контекст), и
    // mouse-события не доходят — выделить текст нельзя. Форсируем: touch→synthetic mouse,
    // preventDefault на touch, чтобы система не лезла. Выделение начинает работать
    // как тап-и-протяжка, а простой тап по ссылке остаётся кликом.
    const cnv = el.querySelector('canvas')
    if (cnv) {
      let touchActive = false
      const fakeMouse = (type, ev, touch) => {
        cnv.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true,
          clientX: touch.clientX, clientY: touch.clientY,
          button: 0, buttons: type === 'mouseup' ? 0 : 1,
          view: window,
        }))
      }
      cnv.addEventListener('touchstart', (ev) => {
        if (ev.touches.length !== 1) return
        touchActive = true
        ev.preventDefault(); ev.stopPropagation()
        fakeMouse('mousedown', ev, ev.touches[0])
      }, { capture: true, passive: false })
      cnv.addEventListener('touchmove', (ev) => {
        if (!touchActive || ev.touches.length !== 1) return
        ev.preventDefault()
        fakeMouse('mousemove', ev, ev.touches[0])
      }, { capture: true, passive: false })
      const endTouch = (ev) => {
        if (!touchActive) return
        touchActive = false
        const t = ev.changedTouches[0]
        fakeMouse('mouseup', ev, t)
        // click — для кликабельных ссылок (обёртка активирует по click)
        fakeMouse('click', ev, t)
      }
      cnv.addEventListener('touchend', endTouch, { capture: true })
      cnv.addEventListener('touchcancel', endTouch, { capture: true })
    }
    // ввод: единый транслятор из обёртки в наших слушателей
    try {
      t.onData((d) => { for (const cb of dataListeners) { try { cb(d) } catch {} } })
    } catch {}
    // выделение → показываем кнопку копирования
    try {
      t.onSelectionChange(() => {
        try {
          const has = !!(t.hasSelection && t.hasSelection())
          if (has) { ensureCopyBtn(); if (copyBtn) copyBtn.style.display = '' }
          else if (copyBtn) copyBtn.style.display = 'none'
        } catch {}
      })
    } catch {}
    // размеры наружу (PTY должен жить в сетке терминала)
    try {
      t.onResize(({ cols, rows }) => {
        size = { cols, rows }
        for (const cb of resizeListeners) { try { cb({ cols, rows }) } catch {} }
      })
    } catch {}
    // отложенные записи, случившиеся до готовности ядра
    for (const chunk of pendingWrites) { try { t.write(chunk) } catch {} }
    pendingWrites = []
    // FitAddon (как у xterm.js): подгонка под контейнер, свой ResizeObserver с дебаунсом.
    // Раньше мы считали сетку сами и ошибались метрикой (canvas вылезал за контейнер).
    try {
      fitAddon = new mod.FitAddon()
      t.loadAddon(fitAddon)
      fitAddon.fit()
    } catch (e) { try { console.warn('[tui] FitAddon не поднялся:', e) } catch {} }
    el.dataset.termEngine = 'ghostty'
    notifyResize()
    fire()
    // повторные подгонки по мере раскладки (контейнер может быть ещё не разложен)
    for (const d of [60, 300, 1000, 2500]) setTimeout(() => {
      if (!disposed && fitAddon) { try { fitAddon.fit() } catch {} }
    }, d)
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
        try { copyBtn && copyBtn.remove() } catch {}
        copyBtn = null
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
