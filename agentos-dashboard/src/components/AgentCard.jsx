import { Icon } from './Icons'
import { cn } from '../lib/utils'

// ===== Dashboard shell matching the Julian Goldie "Life OS" reference =====
export function AgentCard({ plan, tasks, habits, notes, onQuickAction, status = null }) {
  const currentBlock = plan.timeBlocks.find(b => {
    const now = new Date()
    const currentHour = now.getHours() + now.getMinutes() / 60
    return currentHour >= b.startHour && currentHour < b.endHour
  })
  const nextBlock = plan.timeBlocks.find(b => {
    const now = new Date()
    const currentHour = now.getHours() + now.getMinutes() / 60
    return currentHour < b.startHour
  })

  return (
    <div className="space-y-4">
      {/* Top row: System Status & Profile · Deep Work Hub · Current Focus */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SystemCard status={status} />
        <DeepWorkCard currentBlock={nextBlock || currentBlock} />
        <FocusCard currentBlock={currentBlock} plan={plan} />
      </div>

      {/* Middle row: Quick Actions + Today's Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <QuickActions onAction={onQuickAction} />
        <div className="lg:col-span-2">
          <TimelineCard plan={plan} currentBlock={currentBlock} />
        </div>
      </div>

      {/* Bottom row: Active Habits + Recent Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HabitsCard habits={habits} />
        <NotesCard notes={notes} />
      </div>
    </div>
  )
}

// ===== System Status & Profile =====
function SystemCard({ status }) {
  const up = Math.floor((status?.uptime || 0) / 3600)
  const cpu = status?.cpuLoad?.[0]
  const cpuTxt = cpu == null ? '—' : Math.round(cpu * 10) / 10
  const rss = status?.mem?.rss ? Math.round(status.mem.rss / 1024 / 1024) : null
  const provider = status?.openrouter === 'configured' ? 'connected' : 'not configured'

  return (
    <div className="card-surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text">System Status & Profile</h3>
        <button className="text-text-muted hover:text-text"><Icon name="Info" size={16} /></button>
      </div>
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center text-accent text-lg font-bold shrink-0">
          {status?.host ? status.host.slice(0,1).toUpperCase() : 'A'}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-sm font-medium text-text">Status: Live</span>
          </div>
          <p className="text-xs text-text-muted">Host: {status?.host || '—'} · Uptime: {up}ч</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric icon="Cpu" label="CPU" value={`${cpuTxt}%`} />
        <Metric icon="MemoryStick" label="RAM" value={rss ? `${rss}МБ` : '—'} />
        <Metric icon="Link" label="OpenRouter" value={status?.openrouter === 'configured' ? 'connected' : '—'} />
        <Metric icon="User" label="Profiles" value={`${status?.profiles?.length || 0}`} />
      </div>
    </div>
  )
}

function Metric({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-bg-elevated border border-border">
      <Icon name={icon} size={16} className="text-accent shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
        <div className="font-medium text-text truncate">{value}</div>
      </div>
    </div>
  )
}

// ===== Deep Work & Meetings Hub =====
function DeepWorkCard({ currentBlock }) {
  const label = currentBlock?.label || 'Deep Work'
  const minsLeft = currentBlock
    ? Math.max(0, Math.round((currentBlock.endHour - (new Date().getHours() + new Date().getMinutes() / 60)) * 60))
    : null

  return (
    <div className="card-surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Deep Work & Meetings Hub</h3>
        <button className="text-text-muted hover:text-text"><Icon name="MoreHorizontal" size={16} /></button>
      </div>
      <div className="flex items-start gap-4">
        <div className="text-4xl font-bold text-accent font-mono leading-none">
          {minsLeft == null ? '—' : `${String(Math.floor(minsLeft/60)).padStart(2,'0')}:${String(minsLeft%60).padStart(2,'0')}`}
        </div>
        <div className="text-sm">
          <div className="font-medium text-text truncate">{label}</div>
          <div className="text-xs text-text-muted mt-0.5">{currentBlock ? 'Next Up: Deep Work' : 'Free time'}</div>
        </div>
      </div>
      <div className="mt-4 h-16 rounded-xl bg-bg-elevated border border-border overflow-hidden relative">
        <WorkBars />
      </div>
      <p className="text-[11px] text-text-muted mt-2">Activity · today</p>
    </div>
  )
}

function WorkBars() {
  const heights = [25, 40, 30, 60, 45, 75, 50, 90, 60, 70, 40, 30]
  return (
    <svg viewBox="0 0 240 64" className="w-full h-full" preserveAspectRatio="none">
      {heights.map((h, i) => (
        <rect key={i} x={i*20+2} y={64-h} width="14" height={h} rx="3" fill="rgb(var(--cx-accent))" opacity={0.25 + (h/200)} />
      ))}
    </svg>
  )
}

// ===== Current Focus & Goals =====
function FocusCard({ currentBlock, plan }) {
  const priority = plan.priorities?.[0] || 'Deep work'
  const goal = plan.timeBlocks.filter(b => b !== currentBlock)[0]?.label || 'Meeting & Sprint Sync'
  return (
    <div className="card-surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text">Current Focus & Goals</h3>
        <button className="text-text-muted hover:text-text"><Icon name="MoreHorizontal" size={16} /></button>
      </div>
      <div className="space-y-3">
        <FocusRow color="#f59e0b" label="Priority" value={currentBlock?.label || priority} />
        <FocusRow color="#10b981" label="Goal" value={goal} />
        <FocusRow color="#8b5cf6" label="Long-term" value="Stick to Deep Work" />
      </div>
    </div>
  )
}

function FocusRow({ color, label, value }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-bg-elevated border border-border">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
        <div className="text-sm font-medium text-text truncate">{value}</div>
      </div>
    </div>
  )
}

// ===== Quick Actions (3x3) =====
function QuickActions({ onAction }) {
  const actions = [
    { id: 'new-task', label: 'Tasks', icon: 'CheckSquare', color: '#5865f2' },
    { id: 'start-timer', label: 'Timer', icon: 'Clock', color: '#10b981' },
    { id: 'new-note', label: 'Know', icon: 'BookOpen', color: '#f59e0b' },
    { id: 'plan-tomorrow', label: 'Plans', icon: 'Calendar', color: '#ef4444' },
    { id: 'weekly-review', label: 'Review', icon: 'CheckCircle2', color: '#8b5cf6' },
    { id: 'settings', label: 'Settings', icon: 'Settings', color: '#0891b2' },
    { id: 'keys', label: 'Ключи', icon: 'Key', color: '#ec4899' },
    { id: 'terminal', label: 'Terminal', icon: 'Terminal', color: '#64748b' },
    { id: 'capture', label: 'Capture Note', icon: 'FileText', color: '#7c3aed' },
  ]
  return (
    <div className="card-surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Quick Actions</h3>
        <button className="text-text-muted hover:text-text"><Icon name="MoreHorizontal" size={16} /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {actions.map(a => (
          <button key={a.id} onClick={() => onAction(a.id)}
            className="p-3 rounded-xl bg-bg-elevated border border-border hover:border-accent/40 hover:shadow-card transition-all flex flex-col items-center gap-1.5">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${a.color}1a`, color: a.color }}>
              <Icon name={a.icon} size={18} />
            </span>
            <span className="text-[11px] font-medium text-text truncate w-full text-center">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ===== Today's Timeline =====
function TimelineCard({ plan, currentBlock }) {
  const startHour = 8, endHour = 22
  const blocks = plan.timeBlocks || []
  return (
    <div className="card-surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text">Today's Timeline</h3>
        <span className="text-xs text-text-muted">{plan.metrics?.deepWorkHours || 0}h deep work · {plan.metrics?.meetingsHours || 0}h meetings</span>
      </div>
      <div className="space-y-1.5">
        {blocks.length === 0 && (
          <p className="text-sm text-text-muted py-4 text-center">Нет запланированных блоков</p>
        )}
        {blocks.map((b, i) => {
          const isCurrent = b === currentBlock
          return (
            <div key={b.id || i} className={cn("flex items-center gap-3 p-2.5 rounded-xl border border-border transition-all", isCurrent && "border-accent/40 shadow-card")}>
              <div className="w-14 shrink-0 text-xs font-mono text-text-muted">{fmt(b.startHour)}–{fmt(b.endHour)}</div>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: blockColor(b.type) }} />
              <span className="text-sm text-text flex-1 truncate">{b.label || b.type}</span>
              <span className="text-[11px] text-text-muted">{typeLabel(b.type)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function blockColor(type) {
  switch (type) {
    case 'deep_work': return '#5865f2'
    case 'ritual': return '#34d399'
    case 'shallow': return '#fbbf24'
    case 'buffer': return '#f87171'
    default: return '#94a3b8'
  }
}
function typeLabel(t) {
  switch (t) {
    case 'deep_work': return '🔥 Deep Work'
    case 'ritual': return '🧘 Ritual'
    case 'shallow': return '☕ Shallow'
    case 'buffer': return '⏳ Buffer'
    default: return t
  }
}

// ===== Active Habits =====
function HabitsCard({ habits }) {
  return (
    <div className="card-surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text">Active Habits</h3>
        <button className="text-xs text-accent hover:underline">View all</button>
      </div>
      <div className="space-y-3">
        {(habits || []).slice(0, 5).map(h => {
          const pct = Math.min(100, Math.round(((h.metrics?.quality || 0) / 10) * 100))
          return (
            <div key={h.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-text truncate">{h.name}</span>
                  <span className="text-xs text-text-muted">{h.streak}d · {pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-bg-elevated border border-border overflow-hidden">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          )
        })}
        {(habits || []).length === 0 && <p className="text-sm text-text-muted py-2 text-center">Нет привычек</p>}
      </div>
    </div>
  )
}

// ===== Recent Notes =====
function NotesCard({ notes }) {
  return (
    <div className="card-surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text">Recent Notes</h3>
        <div className="flex items-center gap-2">
          <button className="text-text-muted hover:text-text"><Icon name="ChevronLeft" size={16} /></button>
          <button className="text-text-muted hover:text-text"><Icon name="ChevronRight" size={16} /></button>
        </div>
      </div>
      <div className="space-y-2">
        {(notes || []).slice(0, 5).map(n => (
          <div key={n.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-bg-elevated border border-border hover:border-accent/30 transition-all">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/15 text-accent shrink-0">
              <Icon name="FileText" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text truncate">{n.title || 'Без названия'}</div>
              <div className="text-[11px] text-text-muted truncate">{n.excerpt || (n.tags || []).join(' · ')}</div>
            </div>
            {(n.tags || []).slice(0, 2).map(t => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-border text-text-muted shrink-0 hidden sm:inline">{t}</span>
            ))}
          </div>
        ))}
        {(notes || []).length === 0 && <p className="text-sm text-text-muted py-2 text-center">Нет заметок</p>}
      </div>
    </div>
  )
}

function fmt(hour) {
  const h = Math.floor(hour), m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}