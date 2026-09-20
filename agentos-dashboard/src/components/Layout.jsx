import { cn } from '../lib/utils'
import { Icon } from './Icons'

export function AppShell({ sidebarRender, mainRender }) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 flex-shrink-0 h-full overflow-y-auto"
          style={{ background: 'rgba(23, 26, 33, 0.95)', backdropFilter: 'blur(8px)', borderRight: '1px solid #2a2f3a' }}
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

export function Header({ activeView, onViewChange }) {
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
    { id: 'desktop', label: 'Desktop', icon: 'Desktop' },
    { id: 'agents', label: 'Agents', icon: 'Wrench' },
    { id: 'automations', label: 'Automations', icon: 'Clock' },
    { id: 'keys', label: 'Ключи', icon: 'Key' },
    { id: 'harness', label: 'Harness', icon: 'Boxes' },
  ]

  return (
    <header className="h-14 glass border-b border-border flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <Icon name="Brain" size={20} className="text-accent" />
        <h1 className="font-semibold text-lg">Life OS</h1>
      </div>
      <nav className="flex items-center gap-1 bg-bg-elevated/50 rounded-lg p-1 overflow-x-auto">
        {views.map(v => (
          <button
            key={v.id}
            onClick={() => onViewChange(v.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              activeView === v.id
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-bg-card'
            }`}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-bg-elevated/50 rounded-lg text-xs text-text-muted font-mono">
        <span className="w-2 h-2 rounded-full bg-success" />
        <span>Online</span>
      </div>
    </header>
  )
}

export function Sidebar({ activeView, onViewChange, stats }) {
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
    { id: 'desktop', label: 'Desktop', icon: 'Desktop' },
    { id: 'agents', label: 'Agents', icon: 'Wrench' },
    { id: 'automations', label: 'Automations', icon: 'Clock' },
    { id: 'keys', label: 'Ключи', icon: 'Key' },
    { id: 'harness', label: 'Harness', icon: 'Boxes' },
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Icon name="Brain" size={20} className="text-accent" />
          Life OS
        </h2>
        <p className="text-xs text-text-muted mt-1">Mission Control</p>
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