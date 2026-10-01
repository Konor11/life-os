// Движок темы Life OS.
//
// Выбор хранится на СЕРВЕРЕ, а не в localStorage: иначе телефон и ПК показывают разное,
// а требование «сменил тему на ПК — Life OS тоже» не выполнимо в принципе.
//
// Три палитры:
//   glass    — «Стекло», базовая (задана в index.css);
//   classic  — прежняя хcold-серая, путь назад;
//   omarchy  — цвета приходят с ПК (Omarchy) и ставятся инлайном прямо на <html>.
//
// Режим: light | dark | system. «system» — по prefers-color-scheme, как в VS Code.

const MODE_RE = ['light', 'dark', 'system']
// Список палитр держим здесь и в themes.css. Если они разойдутся, палитра из списка
// не найдёт токенов и панель останется на предыдущей — поэтому проверка строгая.
const PALETTE_RE = ['glass', 'classic', 'tokyo-night', 'nord', 'catppuccin', 'gruvbox',
  'dracula', 'rose-pine', 'solarized', 'ayu', 'everforest', 'github', 'midnight', 'omarchy']

// ─────────────────────────────── цвет ───────────────────────────────

function parseHex(c) {
  if (typeof c !== 'string') return null
  let h = c.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map(x => x + x).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const triplet = (rgb) => rgb ? rgb.join(' ') : null

function mix(a, b, t) {
  // t = доля b
  return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t))
}

function luma([r, g, b]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function sat([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  return mx === 0 ? 0 : (mx - mn) / mx
}

// В colors.toml у Омachi смысловые ключи (docs/theming.md), поэтому акцент и статусы
// берём НАПРЯМУЮ, а не угадываем по насыщенности. Угадывание ломалось бы на монохромных
// темах: там самый «цветной» цвет — это просто серый, и акцент уезжал бы в пепел.
const val = (d, ...names) => {
  for (const n of names) { const c = parseHex(d?.[n]); if (c) return c }
  return null
}

// На случай старой темы без смысловых имён — по документации они есть как legacy:
// bg/fg и color0…color15. Тогда акцент/статусы приходится выводить.
function pickAccentFallback(colors) {
  const parsed = (colors || []).map(parseHex).filter(Boolean)
  if (!parsed.length) return null
  const scored = parsed.map(c => ({ c, s: sat(c), l: luma(c) }))
  scored.sort((x, y) => (y.s - x.s) || (y.l - x.l))
  return scored[0].c
}

function pickHue(colors, want) {
  const parsed = (colors || []).map(parseHex).filter(Boolean)
  const score = ([r, g, b]) => {
    if (want === 'green')  return g - Math.max(r, b)
    if (want === 'yellow') return (r + g) / 2 - b
    if (want === 'red')    return r - Math.max(g, b)
    return 0
  }
  const best = parsed.map(c => ({ c, s: score(c) })).sort((x, y) => y.s - x.s)[0]
  return best && best.s > 18 ? best.c : null
}

// ─────────────────────── сборка палитры Омachi ───────────────────────

export function omarchyVars(desktop) {
  // Приоритет — канонические имена, потом legacy (bg/fg, color0…15).
  const bg = val(desktop, 'background', 'bg', 'color0')
  const fg = val(desktop, 'foreground', 'fg', 'bright_foreground', 'color7')
  if (!bg || !fg) return null   // палитра не распознана — лучше обычная тема, чем выдумка

  // Режим из темы, а не из яркости: у Омachi есть светлые темы с тёмным акцентом.
  const mode = String(desktop?.mode || '').toLowerCase()
  const dark = mode ? mode !== 'light' : luma(bg) < 0.5
  const selBg = val(desktop, 'selection', 'selection_background') || mix(bg, fg, dark ? 0.12 : 0.07)
  const muted = val(desktop, 'muted') || mix(fg, bg, 0.42)
  // По документации шкала идёт background → bright_foreground: карточка должна быть
  // чуть светлее фона, граница — между фоном и приглушённым.
  // Карточка должна быть ВЫШЕ фона. В тёмной теме для этого есть lighter_background
  // из шкалы темы; в светлой — подмешиваем белый, иначе mix с foreground сделал бы
  // карточки темнее подложки.
  const raised = dark
    ? (val(desktop, 'lighter_background') || mix(bg, fg, 0.07))
    : mix(bg, [255, 255, 255], 0.75)

  const vars = {
    '--cx-bg': triplet(bg),
    '--cx-bg-card': triplet(raised),
    '--cx-bg-elevated': triplet(selBg),
    '--cx-surface': triplet(raised),
    '--cx-text': triplet(fg),
    '--cx-text-muted': triplet(muted),
    '--cx-text-faint': triplet(mix(fg, bg, 0.64)),
    // Граница = чуть светлее фона; на светлой теме чуть темнее.
    '--cx-border': triplet(dark ? mix(bg, fg, 0.16) : mix(bg, fg, 0.14)),
    '--cx-border-hover': triplet(dark ? mix(bg, fg, 0.28) : mix(bg, fg, 0.26)),
    '--cx-accent': triplet(val(desktop, 'accent', 'color4', 'blue')
                          || pickAccentFallback(desktop.colors)
                          || mix(fg, [124, 107, 255], 0.7)),
    '--cx-accent-2': triplet(val(desktop, 'bright_blue', 'cyan', 'magenta')
                          || pickAccentFallback((desktop.colors || []).slice(8))
                          || mix(fg, [56, 189, 248], 0.7)),
    // Запасные значения — массивы, как и всё остальное: triplet() ждёт [r,g,b].
    '--cx-success': triplet(val(desktop, 'bright_green', 'green') || pickHue(desktop.colors, 'green')
                          || (dark ? [52, 211, 153] : [16, 163, 74])),
    '--cx-warning': triplet(val(desktop, 'bright_yellow', 'yellow') || pickHue(desktop.colors, 'yellow')
                          || (dark ? [251, 191, 36] : [217, 119, 6])),
    '--cx-danger': triplet(val(desktop, 'bright_red', 'red') || pickHue(desktop.colors, 'red')
                          || (dark ? [248, 113, 113] : [220, 38, 38])),
    '--cx-shadow-card': dark
      ? '0 1px 2px rgb(0 0 0 / .35), 0 18px 44px -14px rgb(0 0 0 / .65)'
      : '0 1px 2px rgb(0 0 0 / .06), 0 12px 32px -10px rgb(0 0 0 / .18)',
    // Фон: тонированный вариант цвета темы, а не серый.
    '--cx-app-bg': dark
      ? `radial-gradient(60% 52% at 12% -6%, ${hexA(selBg, 0.55)} 0%, transparent 70%), linear-gradient(180deg, ${hex(bg)} 0%, ${hex(mix(bg, [0, 0, 0], 0.25))} 100%)`
      : `radial-gradient(60% 52% at 12% -6%, ${hexA(selBg, 0.5)} 0%, transparent 70%), linear-gradient(180deg, ${hex(bg)} 0%, ${hex(mix(bg, [255, 255, 255], 0.35))} 100%)`,
  }
  return vars
}

const hex = (rgb) => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')
const hexA = (rgb, a) => {
  const h = hex(rgb)
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

// ─────────────────────────── применение ───────────────────────────

const root = () => document.documentElement

export function systemPrefersDark() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return false }
}

// Режим, который реально применён — им панель должна показывать активную кнопку,
// а не тот, который нажал и который при палитре Омachi может быть перекрыт системой.
export function effectiveMode({ mode = 'light', palette = 'glass', desktop = null } = {}) {
  const dm = palette === 'omarchy' ? String(desktop?.mode || '').toLowerCase() : ''
  if (dm === 'light' || dm === 'dark') return dm
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

// Локальная правка не должна затираться опросом сервера, который пришёл раньше,
// чем наш PUT доехал. Иначе выбор «мигает» назад — выглядит как поломка.
let suppressUntil = 0
export function markLocalChange() { suppressUntil = Date.now() + 5000 }
export function localChangePending() { return Date.now() < suppressUntil }

export function applyTheme({ mode = 'light', palette = 'glass', desktop = null } = {}) {
  const el = root()
  const m = MODE_RE.includes(mode) ? mode : 'light'
  const p = PALETTE_RE.includes(palette) ? palette : 'glass'

  // data-theme — это ПАЛИТРА, а не режим. Режим живёт в data-mode.
  // Так палитра может быть «тёмной» при светлом режиме и наоборот — как в VS Code.
  el.setAttribute('data-theme', p === 'omarchy' ? 'glass' : p)
  el.setAttribute('data-palette', p)

  // При палитре Омachi режим приходит с ПК: там уже есть `mode`, и он отражает
  // светлую или тёмную тему системы. Если ручной выбор противоречит ему, побеждает
  // система — иначе получилось бы «переключил на светлую, а ничего не изменилось».
  const desktopMode = p === 'omarchy' ? String(desktop?.mode || '').toLowerCase() : ''
  // Имя НЕ mode: это уже параметр выше, перекрытие не компилируется.
  const eff = (desktopMode === 'light' || desktopMode === 'dark')
    ? desktopMode
    : (m === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : m)
  el.setAttribute('data-mode', eff)
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', eff === 'dark' ? '#0a0b16' : '#f4f5fb')

  // Палитра Омachi: цвета с ПК ставим инлайном. Если их нет — атрибута нет,
  // и CSS откатывается на обычное «Стекло» (см. index.css), без выдуманных цветов.
  const prev = el.getAttribute('data-omarchy-palette')
  const vars = p === 'omarchy' ? omarchyVars(desktop) : null
  if (vars) {
    for (const [k, v] of Object.entries(vars)) if (v) el.style.setProperty(k, v)
    el.setAttribute('data-omarchy-ready', '1')
    el.setAttribute('data-omarchy-palette', JSON.stringify(vars))
  } else {
    if (prev) for (const k of Object.keys(JSON.parse(prev))) el.style.removeProperty(k)
    el.removeAttribute('data-omarchy-ready')
    el.removeAttribute('data-omarchy-palette')
  }
}

export async function loadTheme() {
  try {
    const r = await fetch('/api/theme', { cache: 'no-store', credentials: 'include' })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return await r.json()
  } catch { return null }
}

export async function saveTheme(next) {
  try {
    await fetch('/api/theme', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
  } catch { /* выбор сохранится при следующем изменении */ }
  return next
}

// Слежение за темой с ПК и за другими устройствами: опрос + обновление при возврате
// на вкладку. Опрос копеечный (около 200 байт), зато не нужен WebSocket только ради темы.
export function watchTheme(onChange, intervalMs = 15000) {
  let last = null
  const tick = async () => {
    if (localChangePending()) return   // только что меняли — не даём старому ответу затереть
    const t = await loadTheme()
    if (!t) return
    const sig = JSON.stringify([t.mode, t.palette, t.desktop?.receivedAt || null])
    if (sig !== last) { last = sig; onChange(t) }
  }
  const id = setInterval(tick, intervalMs)
  const onFocus = () => { if (!localChangePending()) tick() }
  window.addEventListener('focus', onFocus)
  return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
}
