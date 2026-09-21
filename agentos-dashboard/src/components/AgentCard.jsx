import { Icon } from './Icons'
import { cn } from '../lib/utils'

// ===== Dashboard — pixel-faithful reproduction of the Julian Goldie Life OS
// reference. Strict 3-column masonry:
//   Col1: System Status & Profile · Quick Actions (3x3) · Capture Note
//   Col2: Deep Work & Meetings Hub · Today's Timeline (vertical)
//   Col3: Current Focus & Goals · Active Habits · Recent Notes
export function AgentCard({ plan, tasks, habits, notes, onQuickAction, status = null }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      {/* ============ COLUMN 1 ============ */}
      <div className="space-y-4">
        <SystemCard status={status} />
        <QuickActions onAction={onQuickAction} />
        <button onClick={() => onQuickAction && onQuickAction('new-note')}
          className="card-surface rounded-2xl p-4 w-full text-left hover:border-accent/40 transition-all">
          <span className="flex items-center gap-3 text-sm font-medium text-text">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#f59e0b1f', color: '#f59e0b' }}><Icon name="FileText" size={16} /></span>
            Capture Note
          </span>
        </button>
      </div>

      {/* ============ COLUMN 2 ============ */}
      <div className="space-y-4">
        <DeepWorkCard plan={plan} />
        <TimelineCard plan={plan} />
      </div>

      {/* ============ COLUMN 3 ============ */}
      <div className="space-y-4">
        <FocusCard plan={plan} />
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
  const profileData = status?.dataDir?.replace('/root/', '') || '—'
  const profiles = status?.profiles?.length || 0

  return (
    <Card title="System Status & Profile" dots={false}>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg,#5865f2,#7c5cff)' }}>
          <span className="text-lg leading-none">🧑</span>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-text">
            <span className="w-2 h-2 rounded-full bg-success" />
            Upstate. 1.1
          </div>
          <div className="text-xs text-text-muted mt-0.5">Host: {status?.host || '—'} · uptime {up}ч</div>
        </div>
      </div>

      <StatRow icon="Cpu" label="CPU" value={`${cpuTxt}%`} />
      <StatRow icon="MemoryStick" label="RAM" value={rss ? `${rss}МБ` : '—'} />
      <StatRow icon="Link" label="OpenRouter" value={status?.openrouter === 'configured' ? 'connected' : 'not configured'} />
      <StatRow icon="User" label="Profile" value={`${profiles}`} />
      <StatRow icon="Activity" label="Profile data" value={profileData} mono />
    </Card>
  )
}

function StatRow({ icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-bg-elevated transition-colors">
      <Icon name={icon} size={14} className="text-text-muted shrink-0" />
      <span className="text-xs text-text-muted uppercase tracking-wide w-28">{label}</span>
      <span className={cn("text-xs font-medium text-text flex-1 text-right", mono && "font-mono text-accent")}>{value}</span>
    </div>
  )
}

// ===== Deep Work & Meetings Hub =====
function DeepWorkCard({ plan }) {
  const now = new Date()
  const ch = now.getHours() + now.getMinutes() / 60
  const cur = (plan.timeBlocks || []).find(b => ch >= b.startHour && ch < b.endHour)
  const mins = cur ? Math.max(0, Math.round((cur.endHour - ch) * 60)) : 0
  const mm = String(mins % 60).padStart(2, '0')
  const hh = String(Math.floor(mins / 60)).padStart(2, '0')
  const next = (plan.timeBlocks || []).find(b => ch < b.startHour)
  return (
    <Card title="Deep Work & Meetings Hub">
      <div className="flex items-start justify-between">
        <div className="text-5xl font-bold text-text font-mono leading-none">{hh}:{mm}</div>
        <div className="text-right">
          <div className="text-sm font-medium text-text">{cur?.label || 'Deep Work'}</div>
          <div className="text-xs text-text-muted">Next: {next?.label || 'Deep Work'}</div>
        </div>
      </div>
      <div className="mt-3 h-20 rounded-xl bg-bg-elevated border border-border overflow-hidden relative">
        <AreaChart />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-text-muted">
        <span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span>
      </div>
    </Card>
  )
}

function AreaChart() {
  const pts = [[0,70],[30,55],[60,72],[90,40],[120,58],[150,30],[180,48],[210,22],[240,40],[270,34],[300,50],[335,46]]
  const last = pts[pts.length-1][1]
  return (
    <svg viewBox="0 0 340 80" className="w-full h-full" preserveAspectRatio="none">
      <polygon
        points={`0,80 ${pts.map(p=>`${p[0]},${80-p[1]}`).join(' ')} 340,80`}
        fill="rgb(var(--cx-accent))" opacity="0.14"
      />
      <polyline points={`${pts.map(p=>`${p[0]},${80-p[1]}`).join(' ')}`}
        fill="none" stroke="rgb(var(--cx-accent))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length-1][0]} cy={80-last} r="3" fill="rgb(var(--cx-accent))" />
    </svg>
  )
}

// ===== Current Focus & Goals =====
function FocusCard({ plan }) {
  const now = new Date()
  const ch = now.getHours() + now.getMinutes() / 60
  const cur = (plan.timeBlocks || []).find(b => ch >= b.startHour && ch < b.endHour)
  const goal = (plan.timeBlocks || []).find(b => ch < b.startHour)
  const priority = cur?.label || 'Deep work'
  const goalTxt = goal?.label || 'Meeting & Sprint Sync'
  return (
    <Card title="Current Focus & Goals" right={<span className="text-accent text-xs font-medium">Priority ›</span>}>
      <FocusRow color="#f59e0b" label="Priority" value={priority} />
      <FocusRow color="#10b981" label="Goals" value={goalTxt} />
      <FocusRow label="Long-term goals" value="Stick to Deep work" />
    </Card>
  )
}

function FocusRow({ color, label, value }) {
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color || 'rgb(var(--cx-border))' }} />
      <span className="text-xs text-text-muted uppercase tracking-wide w-28">{label}</span>
      <span className="text-xs font-medium text-text flex-1 truncate">{value}</span>
    </div>
  )
}

// ===== Quick Actions (exactly 3x3) =====
function QuickActions({ onAction }) {
  const actions = [
    { id:'new-task', label:'Tasks', icon:'FileText', c:'#7c5cff' },
    { id:'timer', label:'Timer', icon:'Clock', c:'#10b981' },
    { id:'know', label:'Know', icon:'BookOpen', c:'#f59e0b' },
    { id:'plans', label:'Plans', icon:'Calendar', c:'#3b82f6' },
    { id:'review', label:'Review', icon:'CheckCircle2', c:'#ef4444' },
    { id:'settings', label:'Settings', icon:'Settings', c:'#8b5cf6' },
    { id:'keys', label:'Ключи', icon:'Key', c:'#ec4899' },
    { id:'terminal', label:'Terminal', icon:'Terminal', c:'#64748b' },
    { id:'capture', label:'Capture Note', icon:'FileText', c:'#7c3aed' },
  ]
  return (
    <Card title="Quick Actions">
      <div className="grid grid-cols-3 gap-2">
        {actions.map(a => (
          <button key={a.id} onClick={() => onAction && onAction(a.id)}
            className="flex flex-col items-center gap-1.5 px-1 py-3 rounded-xl bg-bg-elevated border border-border hover:border-accent/40 hover:shadow-card transition-all">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${a.c}1f`, color: a.c }}>
              <Icon name={a.icon} size={16} />
            </span>
            <span className="text-[10px] font-medium text-text-muted leading-none text-center">{a.label}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}

// ===== Today's Timeline (vertical, hours + colored events) =====
const DEMO_BLOCKS = [
  { id:'d1', label:'Deep Work', type:'deep_work', startHour:8, endHour:9 },
  { id:'d2', label:'Sprint Sync', type:'ritual', startHour:12, endHour:14 },
  { id:'d3', label:'Идеи для UI', type:'deep_work', startHour:16, endHour:17 },
  { id:'d4', label:'Sprint Sync', type:'buffer', startHour:20, endHour:21 },
]
function TimelineCard({ plan }) {
  const now = new Date()
  const ch = now.getHours() + now.getMinutes() / 60
  const real = (plan.timeBlocks || []).filter(b => b.endHour >= 8 && b.startHour <= 22)
  const blocks = real.length ? real : DEMO_BLOCKS
  const current = blocks.find(b => ch >= b.startHour && ch < b.endHour)
  const hours = []
  for (let h = 8; h <= 22; h += 1) {
    const evs = blocks.filter(b => h >= b.startHour && h < b.endHour)
    hours.push({ h, evs, isCurrent: current && h >= current.startHour && h < current.endHour })
  }
  return (
    <Card title="Today's Timeline" right={<span className="text-xs text-text-muted">Horizontal Timeline ⇄</span>}>
      <div className="space-y-[2px]">
        {hours.map(({ h, evs, isCurrent }) => (
          <div key={h} className={cn("flex items-stretch gap-2", isCurrent && "bg-bg-elevated rounded-md")}>
            <div className="w-9 text-[10px] text-text-muted font-mono text-right shrink-0 self-center">{h}:00</div>
            <div className="flex-1 min-h-[18px] rounded-[4px] flex items-center px-2 text-[10px] text-text truncate"
              style={evs.length ? { background: blockBg(evs[0].type) } : {}}>
              {evs.length ? `${evs[0].label || evs[0].type}` : ''}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function blockBg(t) {
  switch (t) {
    case 'deep_work': return 'rgba(245,197,66,0.32)'
    case 'ritual': return 'rgba(52,211,153,0.3)'
    case 'shallow': return 'rgba(251,191,36,0.3)'
    case 'buffer': return 'rgba(248,113,113,0.28)'
    default: return 'rgb(var(--cx-border))'
  }
}

// ===== Active Habits (blue progress bars) =====
const DEMO_HABITS = [
  { id:'ph1', name:'Hydration', streak:7, metrics:{ quality:8 } },
  { id:'ph2', name:'Reading', streak:12, metrics:{ quality:6 } },
  { id:'ph3', name:'Coding', streak:21, metrics:{ quality:9 } },
]
function HabitsCard({ habits }) {
  const list = ((habits && habits.length) ? habits : DEMO_HABITS).slice(0, 5)
  return (
    <Card title="Active Habits">
      <div className="space-y-2.5">
        {list.map(h => {
          const pct = Math.min(100, Math.round(((h.metrics?.quality || h.streak || 0) / 10) * 100))
          return (
            <div key={h.id}>
              <div className="flex items-center gap-2 text-sm font-medium text-text">{h.name}
                <span className="text-[10px] text-text-muted flex-1 text-right">{h.streak}d · {pct}%</span>
              </div>
              <div className="h-2 mt-1 rounded-full bg-bg-elevated border border-border overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'rgb(var(--cx-accent))' }} />
              </div>
            </div>
          )
        })}
        {list.length === 0 && <p className="text-sm text-text-muted py-2 text-center">Нет привычек</p>}
      </div>
    </Card>
  )
}

// ===== Recent Notes =====
function NotesCard({ notes }) {
  const list = (notes || []).slice(0, 5)
  const noteColor = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6']
  return (
    <Card title="Recent Notes" right={
      <span className="flex items-center gap-1 text-text-muted">
        <Icon name="ChevronLeft" size={14} />
        <Icon name="ChevronRight" size={14} />
      </span>
    }>
      <div className="space-y-1.5">
        {list.map((n, i) => (
          <div key={n.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-bg-elevated transition-colors">
            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{ background: `${noteColor[i % noteColor.length]}1f`, color: noteColor[i % noteColor.length] }}>
              <Icon name="FileText" size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-text truncate leading-tight">{n.title || 'Без названия'}</div>
              <div className="text-[10px] text-text-muted leading-tight">{(n.tags || []).slice(0, 2).join(' · ')}</div>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-text-muted py-2 text-center">Нет заметок</p>}
      </div>
    </Card>
  )
}

// ===== generic card =====
function Card({ title, right, dots = true, children }) {
  return (
    <div className="card-surface rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <div className="flex items-center gap-1">
          {right}
          {dots && <span className="text-text-muted tracking-tighter">⋯</span>}
        </div>
      </div>
      {children}
    </div>
  )
}