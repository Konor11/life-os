/**
 * Терминал вкладки Chat. Оставлен один движок — xterm.js: rioterm (VT-ядро Rio) и ghostty
 * (VT-ядро Ghostty) пробовали по просьбе пользователя и убрали — на телефоне они работали хуже.
 * Файл сохранён адаптером, чтобы ChatPanel создавал терминал в одном месте.
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// Один живой терминал на контейнер: эффект ChatPanel перезапускается (смена профиля, Web/TUI),
// и второй инстанс в том же контейнере оставлял видимым пустой канвас.
const instances = new WeakMap()

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

export function createTuiEngine(args) {
  const prev = instances.get(args.el)
  if (prev) { try { prev.term.dispose() } catch {} ; instances.delete(args.el) }
  const engine = xtermEngine(args)
  try { instances.set(args.el, engine) } catch {}
  return engine
}
