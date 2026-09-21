import { cn } from '../lib/utils'
import { Icon } from './Icons'

export function AppShell({ sidebarRender, mainRender }) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 flex-shrink-0 h-full overflow-y-auto"
          style={{ background: 'rgb(var(--cx-bg-card) / 0.92)', backdropFilter: 'blur(8px)', borderRight: '1px solid rgb(var(--cx-border))' }}
        >
          {sidebarRender}
        </aside>
        <main className="flex-1 flex flex-col overflow-hidden bg-bg">
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
  ].filter(v => !v.component || compInstalled(v.id))

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
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
      <nav className="flex-1 px-3 py-4 space-y-1">
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
    <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
      <div className="mx-auto">
        {children}
      </div>
    </div>
  )
}

export function StatusBar({ agents }) {
  return (
    <footer className="h-10 glass border-t border-border flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        {agents.map(a => (
          <div key={a.id} className="flex items-center gap-1.5 text-xs">
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
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span>WebSocket: Connected</span>
        <span>Latency: 24ms</span>
      </div>
    </footer>
  )
}