import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icons'
import { Mascot } from './Mascot'

// Общие улучшения панели: поиск по всему интерфейсу (⌘K / Ctrl+K), горячие клавиши навигации,
// всплывающие уведомления и «быстрый переход» по разделам.
//
// Держим всё в одном модуле, потому что это пересекающиеся мелочи: палитра поиска, хоткеи и
// навигация работают по одному списку разделов (NAV), а уведомления нужны и палитре, и хоткеям.

// Разделы панели: id должен совпадать с activeView в Layout.jsx.
export const NAV = [
  { id: 'dashboard', label: 'Dashboard', hint: 'обзор, быстрые действия', icon: 'LayoutDashboard' },
  { id: 'plan', label: 'План', hint: 'расписание дня, приоритеты', icon: 'Calendar' },
  { id: 'tasks', label: 'Задачи', hint: 'GTD, доска, контексты', icon: 'CheckSquare' },
  { id: 'knowledge', label: 'Знания', hint: 'заметки и связи', icon: 'BookOpen' },
  { id: 'habits', label: 'Привычки', hint: 'серии, ритуалы', icon: 'Target' },
  { id: 'finances', label: 'Финансы', hint: 'счета, бюджеты, цели', icon: 'Wallet' },
  { id: 'health', label: 'Здоровье', hint: 'метрики, тренировки, сон', icon: 'Heart' },
  { id: 'learning', label: 'Обучение', hint: 'курсы, ресурсы', icon: 'GraduationCap' },
  { id: 'contacts', label: 'Контакты', hint: 'люди, организации, встречи', icon: 'Users' },
  { id: 'memory', label: 'Память', hint: 'документы и семантический поиск', icon: 'Database' },
  { id: 'calendar', label: 'Календарь', hint: 'события', icon: 'Calendar' },
  { id: 'projects', label: 'Проекты', hint: 'ход проектов', icon: 'Folder' },
  { id: 'assistant', label: 'Ассистент', hint: 'диалог с агентами', icon: 'Brain' },
  { id: 'brain', label: 'Второй мозг', hint: 'граф заметок', icon: 'Sparkles' },
  { id: 'chat', label: 'Чат', hint: 'терминалы движков', icon: 'MessageSquare' },
  { id: 'terminal', label: 'Терминал', hint: 'оболочка сервера', icon: 'Terminal', adminOnly: true },
  { id: 'files', label: 'Файлы', hint: 'менеджер файлов', icon: 'Folder', adminOnly: true },
  { id: 'processes', label: 'Процессы', hint: 'что реально работает на сервере', icon: 'Activity', adminOnly: true },
  { id: 'agents', label: 'Агенты', hint: 'профили и состояние', icon: 'Wrench' },
  { id: 'automations', label: 'Автоматизации', hint: 'сценарии', icon: 'Clock' },
  { id: 'keys', label: 'Ключи', hint: 'API-ключи', icon: 'Key' },
  { id: 'harness', label: 'Установка', hint: 'движки и компоненты', icon: 'Boxes', adminOnly: true },
  { id: 'split', label: 'Split Pane', hint: 'мультиагентный экран', icon: 'Layout', adminOnly: true },
  { id: 'settings', label: 'Настройки', hint: 'вид, движки, безопасность', icon: 'Settings' },
]

// -------------------------------------------------------------------- палитра ----

export function CommandPalette({ open, onClose, onNavigate, items = NAV }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(n =>
      n.label.toLowerCase().includes(s) ||
      (n.hint || '').toLowerCase().includes(s) ||
      n.id.includes(s))
  }, [q, items])

  useEffect(() => {
    if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])

  useEffect(() => { if (sel >= results.length) setSel(0) }, [results.length, sel])

  if (!open) return null
  const go = (n) => { if (!n) return; onNavigate(n.id); onClose() }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(results.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[sel]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl border border-border"
        style={{ background: 'rgb(var(--cx-bg-card))' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 border-b border-border">
          <Icon name="Search" size={16} className="text-text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setSel(0) }}
            onKeyDown={onKey}
            placeholder="Куда перейти… (раздел или подсказка)"
            className="flex-1 py-3.5 bg-transparent outline-none text-sm text-text placeholder:text-text-muted"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-muted">esc</kbd>
        </div>
        <div className="max-h-[46vh] overflow-y-auto py-1.5">
          {results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-text-muted">Ничего не найдено</div>
          )}
          {results.map((n, i) => (
            <button
              key={n.id}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(n)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === sel ? 'bg-accent/10' : 'hover:bg-bg-elevated'
              }`}
            >
              <Icon name={n.icon} size={16} className={i === sel ? 'text-accent' : 'text-text-muted'} />
              <span className="text-sm text-text">{n.label}</span>
              {n.hint && <span className="text-xs text-text-muted truncate">{n.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------- хоткеи и ⌘K ----

export function useHotkeys(onNavigate, isAdmin = true) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navRef = useRef(onNavigate)
  navRef.current = onNavigate
  const isAdminRef = useRef(isAdmin)
  isAdminRef.current = isAdmin

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPaletteOpen(v => !v); return
      }
      if (typing) return
      // Alt+1..9 — быстрый переход по первым девяти разделам (без админских)
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const list = isAdminRef.current ? NAV : NAV.filter(n => !n.adminOnly)
        const n = list[parseInt(e.key, 10) - 1]
        if (n) navRef.current(n.id)
      }
      // g d — «go dashboard», двойное нажатие как в редакторах
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = setTimeout(() => { }, 0)
        // реализуем просто: g затем d в течение 700 мс
        const handler = (e2) => {
          if (e2.key === 'd') { navRef.current('dashboard') }
          window.removeEventListener('keydown', handler, true)
          clearTimeout(t)
        }
        setTimeout(() => window.addEventListener('keydown', handler, true), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return { paletteOpen, setPaletteOpen }
}

// --------------------------------------------------------------- уведомления ----

let pushToast = null

export function toast(message, opts = {}) {
  if (pushToast) pushToast(message, opts)
}

export function ToastHost() {
  const [items, setItems] = useState([])
  const seq = useRef(0)

  useEffect(() => {
    pushToast = (message, opts) => {
      const id = ++seq.current
      setItems(list => [...list.slice(-3), { id, message, ...opts }])
      setTimeout(() => setItems(list => list.filter(t => t.id !== id)), opts.timeout || 4200)
    }
    return () => { pushToast = null }
  }, [])

  const dismiss = (id) => setItems(list => list.filter(t => t.id !== id))
  if (!items.length) return null

  return (
    <div className="fixed z-50 bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-end pointer-events-none">
      {items.map(t => {
        const state = t.state || 'info'
        const mood = state === 'work' ? 'work' : state === 'error' ? 'error' : state === 'ok' ? 'ok' : 'idle'
        return (
          <div key={t.id} onClick={() => dismiss(t.id)} title="закрыть"
            className="pointer-events-auto cursor-pointer flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border shadow-lg max-w-sm"
            style={{ background: 'rgb(var(--cx-bg-card))', borderColor: 'rgb(var(--cx-border))' }}>
            <Mascot size={26} state={mood} className="text-accent" />
            <span className="text-sm text-text">{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------- пустое состояние ----

// Единый вид пустого раздела: маскот, понятное предложение и кнопка действия.
// Раньше пустые разделы были просто пустым местом с мелкой подписью.
export function EmptyState({ icon = 'Inbox', title, hint, action, onAction, mascot = 'idle' }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 gap-3">
      <Mascot size={56} state={mascot} className="text-accent opacity-90" />
      <Icon name={icon} size={20} className="text-text-muted" />
      <div className="text-sm font-medium text-text">{title}</div>
      {hint && <div className="text-xs text-text-muted max-w-sm leading-relaxed">{hint}</div>}
      {action && (
        <button onClick={onAction} className="mt-1 px-4 py-2 rounded-lg bg-accent text-white text-sm">
          {action}
        </button>
      )}
    </div>
  )
}
