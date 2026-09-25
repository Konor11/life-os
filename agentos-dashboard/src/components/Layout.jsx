import { useState, useEffect, cloneElement } from 'react'
import { cn } from '../lib/utils'
import { Icon } from './Icons'

export function AppShell({ sidebarRender, mainRender }) {
  // Mobile: sidebar is an overlay drawer toggled by the burger in the top bar.
  // Desktop (lg+): sidebar always visible, no burger needed.
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024)
  useEffect(() => {
    const onRz = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', onRz)
    return () => window.removeEventListener('resize', onRz)
  }, [])
  // Close the drawer when the viewport grows to desktop
  useEffect(() => { if (!isMobile) setOpen(false) }, [isMobile])
  // Lock body scroll while the drawer is open on mobile
  useEffect(() => {
    document.body.style.overflow = open && isMobile ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open, isMobile])

  // Wrap the sidebar's onViewChange so a navigation click also closes the drawer
  let sidebarEl = sidebarRender
  if (open && isMobile && sidebarRender?.props?.onViewChange) {
    sidebarEl = cloneElement(sidebarRender, {
      onViewChange: (v) => { sidebarRender.props.onViewChange(v); setOpen(false) },
    })
  }

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {/* Mobile top bar (burger + title) — hidden on desktop */}
      {isMobile && (
        <header className="h-12 flex-shrink-0 flex items-center gap-3 px-3 border-b border-border"
          style={{ background: 'rgb(var(--cx-bg-card) / 0.92)' }}>
          <button
            onClick={() => setOpen(o => !o)}
            className="p-2 -ml-1 rounded-lg text-text-muted hover:text-text hover:bg-bg-elevated transition-colors"
            aria-label="Меню"
          >
            <Icon name={open ? 'X' : 'Menu'} size={22} />
          </button>
          <span className="font-semibold text-base flex items-center gap-2">
            <Icon name="Brain" size={18} className="text-accent" />
            Life OS
          </span>
        </header>
      )}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Backdrop: taps outside the drawer close it */}
        {open && isMobile && (
          <div
            className="absolute inset-0 z-30 bg-black/50"
            onClick={() => setOpen(false)}
            aria-label="Закрыть меню"
          />
        )}
        <aside
          className={cn(
            'w-64 flex-shrink-0 h-full overflow-y-auto z-40',
            // Mobile: off-canvas drawer, animated; Desktop: static column.
            isMobile
              ? `absolute inset-y-0 left-0 transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`
              : 'relative'
          )}
          style={{ background: 'rgb(var(--cx-bg-card) / 0.98)', backdropFilter: 'blur(8px)', borderRight: '1px solid rgb(var(--cx-border))' }}
        >
          {sidebarEl}
        </aside>
        <main className="flex-1 flex flex-col overflow-hidden bg-bg min-w-0">
          {mainRender}
        </main>
      </div>
    </div>
  )
}

export function Sidebar({ activeView, onViewChange, stats, theme, onToggleTheme, installedComponents }) {
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
    { id: 'n8n', label: 'n8n', icon: 'Zap', component: true },
    { id: 'coder', label: 'Coder', icon: 'Terminal', component: true },
    { id: 'terminal', label: 'Terminal', icon: 'Terminal' },
    { id: 'files', label: 'Files', icon: 'Folder' },
    { id: 'chat', label: 'Chat', icon: 'MessageSquare' },
    { id: 'settings', label: 'Settings', icon: 'Settings' },
    { id: 'agents', label: 'Agents', icon: 'Wrench' },
    { id: 'automations', label: 'Automations', icon: 'Clock' },
    { id: 'keys', label: 'Ключи', icon: 'Key' },
    { id: 'harness', label: 'Установка компонентов', icon: 'Boxes' },
    { id: 'split', label: 'Split Pane', icon: 'Layout' },
  ].filter(v => !v.component || compInstalled(v.id))

  return (
    <div className="h-full flex flex-col">
      {/* Desktop header: brand + theme toggle. Mobile has its own top bar,
          so here the brand row is hidden to save vertical space in the drawer. */}
      <div className="hidden lg:flex p-4 border-b border-border items-center justify-between">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Icon name="Brain" size={20} className="text-accent" />
          Life OS
        </h2>
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-bg-elevated/60 border border-border text-xs font-medium text-text-muted hover:text-text hover:border-border-hover transition-all"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
      {/* Mobile: theme toggle inline above the nav */}
      <div className="lg:hidden px-3 pt-3 flex justify-end">
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-bg-elevated/60 border border-border text-xs font-medium text-text-muted"
        >
          {theme === 'dark' ? '☀️' : '🌙'} Тема
        </button>
      </div>
      <nav className="flex-1 px-3 py-3 space-y-1">
        {views.map(v => (
          <button
            key={v.id}
            onClick={() => onViewChange(v.id)}
            className={`w-full px-3 py-2.5 rounded-lg transition-all flex items-center gap-3 text-sm font-medium ${
              activeView === v.id
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-bg-elevated'
              }`}
          >
            <Icon name={v.icon} size={20} />
            <span>{v.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-border space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <StatCard label="Tasks" value={stats?.tasksPending || 0} icon="CheckSquare" />
          <StatCard label="Habits" value={stats?.habitsActive || 0} icon="Target" />
          <StatCard label="Notes" value={stats?.notesCount || 0} icon="BookOpen" />
          <StatCard label="Deep Work" value={stats?.deepWorkToday ? `${stats.deepWorkToday}h` : '0h'} icon="Clock" />
        </div>
        <div className="text-xs text-text-muted text-center">Life OS v1.0</div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }) {
  return (
    <div className="glass p-2 rounded-lg">
      <div className="flex items-center gap-1 text-text-muted mb-0.5">
        <Icon name={icon} size={12} />
        <span>{label}</span>
      </div>
      <div className="font-semibold text-text">{value}</div>
    </div>
  )
}

export function MainContent({ children }) {
  return (
    <div className="flex-1 overflow-y-auto p-3 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
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