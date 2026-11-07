import { useState, useEffect, cloneElement } from 'react'
import { cn } from '../lib/utils'
import { Icon } from './Icons'
import { Mascot } from './Mascot'

// ── Мобильный нижний таб-бар в стиле apple.com / iOS ────────────────────────
// 4 главных вкладки + «Ещё» (шторка со всеми разделами). Burger-меню больше
// не нужен: навигация всегда под пальцем, как в приложениях Apple.
const TAB_ITEMS = [
  { id: 'chat', label: 'Chat', icon: 'MessageSquare' },
  { id: 'plan', label: 'Planner', icon: 'Calendar' },
  { id: 'tasks', label: 'Tasks', icon: 'CheckSquare' },
  { id: 'knowledge', label: 'Knowledge', icon: 'BookOpen' },
]

function TabBar({ activeView, onViewChange, onOpenMore, moreActive }) {
  return (
    <nav
      className="lg:hidden flex-shrink-0 flex items-stretch border-t border-border nav-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Основная навигация"
    >
      {TAB_ITEMS.map(t => (
        <button
          key={t.id}
          onClick={() => onViewChange(t.id)}
          className={cn(
            'flex-1 flex flex-col items-center gap-1 pt-2 pb-2 transition-colors',
            activeView === t.id ? 'text-accent tab-active' : 'text-text-muted'
          )}
        >
          <Icon name={t.icon} size={22} />
          <span className="text-[10px] font-medium">{t.label}</span>
        </button>
      ))}
      <button
        onClick={onOpenMore}
        className={cn(
          'flex-1 flex flex-col items-center gap-1 pt-2 pb-2 transition-colors',
          moreActive ? 'text-accent' : 'text-text-muted'
        )}
        aria-label="Все разделы"
      >
        <Icon name="Grid" size={22} />
        <span className="text-[10px] font-medium">Ещё</span>
      </button>
    </nav>
  )
}

// Шторка «Ещё»: все разделы панели, как список настроек iOS.
function MoreSheet({ open, onClose, sidebarRender }) {
  if (!open) return null
  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col" role="dialog" aria-label="Все разделы">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative mt-12 flex-1 overflow-y-auto nav-blur border-t border-border rounded-t-3xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sticky top-0 nav-blur flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="font-semibold text-lg">Все разделы</span>
          <button onClick={onClose} className="p-2 -mr-2 rounded-lg text-text-muted hover:text-text" aria-label="Закрыть">
            <Icon name="X" size={22} />
          </button>
        </div>
        {sidebarRender}
      </div>
    </div>
  )
}

export function AppShell({ sidebarRender, mainRender, onOpenPalette, onToggleTheme, theme }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024)
  useEffect(() => {
    const onRz = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', onRz)
    return () => window.removeEventListener('resize', onRz)
  }, [])
  useEffect(() => { if (!isMobile) setMoreOpen(false) }, [isMobile])

  // Навигация из шторки закрывает её; на десктопе пробрасываем как есть.
  let sidebarEl = sidebarRender
  if (sidebarRender && (sidebarRender.props?.onViewChange || onOpenPalette)) {
    sidebarEl = cloneElement(sidebarRender, {
      ...(sidebarRender.props?.onViewChange ? {
        onViewChange: (v) => { sidebarRender.props.onViewChange(v); setMoreOpen(false) },
      } : {}),
      ...(onOpenPalette ? { onOpenPalette } : {}),
    })
  }

  const tabActive = TAB_ITEMS.some(t => t.id === sidebarRender?.props?.activeView)

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {/* Тонкая шапка в стиле глобальной навигации apple.com: 44px, blur, минимум
          элементов — лого слева, поиск и тема справа. Одинаковая на всех экранах. */}
      <header className="h-12 flex-shrink-0 flex items-center gap-3 px-4 sm:px-5 border-b border-border nav-blur">
        <button
          onClick={() => sidebarRender?.props?.onViewChange?.('dashboard')}
          className="flex items-center gap-2 font-semibold text-[15px] tracking-tight"
          aria-label="Life OS — на главную"
        >
          <Mascot size={20} className="text-accent shrink-0" title="Life OS" />
          <span className="hidden sm:inline">Life OS</span>
        </button>
        {/* Поиск по разделам — как лупа в навигации apple.com */}
        <button
          onClick={onOpenPalette}
          title="Поиск по разделам (Ctrl+K)"
          className="ml-auto p-2 -mr-2 rounded-lg text-text-muted hover:text-text transition-colors"
          aria-label="Поиск"
        >
          <Icon name="Search" size={18} />
        </button>
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          className="p-2 -mr-1 rounded-lg text-text-muted hover:text-text transition-colors"
          aria-label="Сменить тему"
        >
          <Icon name={theme === 'dark' ? 'Sun' : 'Moon'} size={18} />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop: тихая навигация слева, как в System Settings на macOS. */}
        <aside
          className="hidden lg:flex flex-col w-60 flex-shrink-0 h-full overflow-y-auto border-r border-border"
          style={{ background: 'rgb(var(--cx-bg-card) / 0.5)' }}
        >
          {sidebarEl}
        </aside>
        <main className="flex-1 flex flex-col overflow-hidden bg-bg min-w-0">
          {mainRender}
        </main>
      </div>

      {/* Mobile: нижний таб-бар + шторка «Ещё» */}
      {isMobile && (
        <>
          <TabBar
            activeView={sidebarRender?.props?.activeView}
            onViewChange={(v) => sidebarRender?.props?.onViewChange?.(v)}
            onOpenMore={() => setMoreOpen(o => !o)}
            moreActive={moreOpen || (!tabActive && !!sidebarRender?.props?.activeView)}
          />
          <MoreSheet
            open={moreOpen}
            onClose={() => setMoreOpen(false)}
            sidebarRender={sidebarEl}
          />
        </>
      )}
    </div>
  )
}

export function Sidebar({ activeView, onViewChange, stats, theme, onToggleTheme, installedComponents, onOpenPalette, isAdmin = true }) {
  // n8n / Coder appear in the menu only after they are installed («Установка компонентов»).
  const compInstalled = (id) => !installedComponents || installedComponents[id] !== false
  const views = [
    { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { id: 'plan', label: 'Plan', icon: 'Calendar' },
    { id: 'tasks', label: 'Tasks', icon: 'CheckSquare' },
    { id: 'knowledge', label: 'Knowledge', icon: 'BookOpen' },
    { id: 'habits', label: 'Habits', icon: 'Target' },
    { id: 'finances', label: 'Finances', icon: 'Wallet' },
    { id: 'health', label: 'Health', icon: 'Heart' },
    { id: 'learning', label: 'Learning', icon: 'GraduationCap' },
    { id: 'contacts', label: 'Contacts', icon: 'Users' },
    { id: 'memory', label: 'Memory', icon: 'Database' },
    { id: 'calendar', label: 'Calendar', icon: 'Calendar' },
    { id: 'projects', label: 'Projects', icon: 'Folder' },
    { id: 'assistant', label: 'Assistant', icon: 'Brain' },
    { id: 'brain', label: 'Второй мозг', icon: 'Sparkles' },
    { id: 'omniroute', label: 'OmniRoute', icon: 'Route', component: true },
    { id: 'n8n', label: 'n8n', icon: 'Zap', component: true },
    { id: 'coder', label: 'Coder', icon: 'Terminal', component: true, adminOnly: true },
    { id: 'vaultwarden', label: 'Vaultwarden', icon: 'Key', component: true, adminOnly: true },
    { id: 'terminal', label: 'Terminal', icon: 'Terminal', adminOnly: true },
    { id: 'files', label: 'Files', icon: 'Folder', adminOnly: true },
    { id: 'chat', label: 'Chat', icon: 'MessageSquare' },
    { id: 'settings', label: 'Settings', icon: 'Settings' },
    { id: 'agents', label: 'Agents', icon: 'Wrench' },
    { id: 'automations', label: 'Automations', icon: 'Clock' },
    { id: 'keys', label: 'Ключи', icon: 'Key', adminOnly: true },
    { id: 'harness', label: 'Установка компонентов', icon: 'Boxes', adminOnly: true },
    { id: 'split', label: 'Split Pane', icon: 'Layout', adminOnly: true },
  ].filter(v => !v.component || compInstalled(v.id))
    // Админские разделы (терминал, файлы, установка движков, ключи, Split Pane) не показываем
    // тем, у кого нет роли администратора. Скрытие — только для удобства: настоящая проверка
    // прав стоит на бэкенде (authGuard), поэтому руками введённый адрес всё равно не откроет.
    .filter(v => !v.adminOnly || isAdmin)

  return (
    <div className="h-full flex flex-col">
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {views.map(v => (
          <button
            key={v.id}
            onClick={() => onViewChange(v.id)}
            className={`w-full px-3 py-2 rounded-[10px] transition-colors flex items-center gap-3 text-[13px] font-medium ${
              activeView === v.id
                ? 'bg-bg-elevated text-text'
                : 'text-text-muted hover:text-text hover:bg-bg-card/60'
              }`}
          >
            <Icon name={v.icon} size={17} />
            <span>{v.label}</span>
          </button>
        ))}
      </nav>
      {/* Компактная сводка внизу. */}
      <div className="p-3 border-t border-border">
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <StatCard label="Tasks" value={stats?.tasksPending || 0} icon="CheckSquare" />
          <StatCard label="Habits" value={stats?.habitsActive || 0} icon="Target" />
          <StatCard label="Notes" value={stats?.notesCount || 0} icon="BookOpen" />
          <StatCard label="Deep Work" value={stats?.deepWorkToday ? `${stats.deepWorkToday}h` : '0h'} icon="Clock" />
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-bg-elevated/60">
      <Icon name={icon} size={12} className="text-text-faint" />
      <span className="text-text-muted">{label}</span>
      <span className="ml-auto font-semibold text-text">{value}</span>
    </div>
  )
}

export function MainContent({ children }) {
  return (
    /* pb-24 на мобиле: контент прокручивается ЗА таб-баром, и без запаса
       последняя карточка пряталась под ним (таб-бар непрозрачен до конца). */
    <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 pb-32 md:pb-28 lg:pb-10">
      <div className="mx-auto max-w-5xl">
        {children}
      </div>
    </div>
  )
}

export function StatusBar({ agents }) {
  return (
    <footer className="h-9 flex-shrink-0 glass border-t border-border flex items-center justify-between px-3 sm:px-4">
      <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto">
        {agents.map(a => (
          <div key={a.id} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <span
              className={`w-2 h-2 rounded-full ${
                a.status === 'active' ? 'bg-success' :
                a.status === 'thinking' ? 'bg-warning' :
                'bg-border-hover'
              }`}
            />
            <span className="text-text-muted">{a.name}</span>
          </div>
        ))}
      </div>
      {/* Right side: real backend health, polled; fake numbers removed */}
      <StatusPing />
    </footer>
  )
}

function StatusPing() {
  const [online, setOnline] = useState(null)  // null = checking
  useEffect(() => {
    let alive = true
    const check = () => {
      fetch('/api/status', { cache: 'no-store' })
        .then(r => { if (alive) setOnline(r.ok) })
        .catch(() => { if (alive) setOnline(false) })
    }
    check()
    const t = setInterval(check, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return (
    <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className={`w-2 h-2 rounded-full ${online === true ? 'bg-success' : online === false ? 'bg-danger' : 'bg-border-hover'}`} />
      <span className="text-text-muted hidden sm:inline">Backend {online === true ? 'онлайн' : online === false ? 'недоступен' : '…'}</span>
    </div>
  )
}
