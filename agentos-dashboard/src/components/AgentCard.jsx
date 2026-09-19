import { cn } from '../lib/utils'
import { Icon } from './Icons'

export function AgentCard({ plan, tasks, habits, notes, onQuickAction }) {
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
    <div className="space-y-6">
      {/* Current Focus */}
      <div className="glass p-6 rounded-xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">Current Focus</p>
            <h2 className="text-2xl font-bold text-text">{currentBlock?.label || 'No active block'}</h2>
            <p className="text-sm text-text-muted mt-1">
              {currentBlock 
                ? `${formatTime(currentBlock.startHour)} — ${formatTime(currentBlock.endHour)}`
                : 'Free time'
              }
            </p>
          </div>
          {currentBlock && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-3xl font-bold text-text">{Math.max(0, Math.round((currentBlock.endHour - (new Date().getHours() + new Date().getMinutes() / 60)) * 60))}</div>
                <div className="text-xs text-text-muted">min left</div>
              </div>
              <div className="w-px h-12 bg-border" />
              <button className="p-2 rounded-lg hover:bg-bg-elevated transition-colors" onClick={() => onQuickAction('complete-block')}>
                <Icon name="Check" size={20} />
              </button>
            </div>
          )}
        </div>
        {currentBlock && currentBlock.taskId && (
          <div className="glass-strong p-3 rounded-lg">
            <p className="text-xs text-text-muted">Linked Task</p>
            <p className="font-medium text-text">{tasks.find(t => t.id === currentBlock.taskId)?.title || currentBlock.taskId}</p>
          </div>
        )}
      </div>

      {/* Grid: Quick Actions + Next Up + Habits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-1 space-y-4">
          <QuickActions onAction={onQuickAction} />
          
          {/* Next Up */}
          <div className="glass p-4 rounded-xl">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Next Up</p>
            <div className="space-y-2">
              {plan.timeBlocks
                .filter(b => b !== currentBlock)
                .slice(0, 4)
                .map(b => (
                  <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-elevated/50 transition-colors">
                    <div className={`w-3 h-3 rounded-full ${getTypeColor(b.type)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{b.label}</p>
                      <p className="text-xs text-text-muted">{formatTime(b.startHour)} — {formatTime(b.endHour)}</p>
                    </div>
                    <span className="text-xs text-text-muted">{b.type === 'deep_work' ? '🔥' : b.type === 'ritual' ? '🧘' : '☕'}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Today's Plan Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass p-4 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Today's Timeline</p>
              <span className="text-sm font-medium text-text">{plan.metrics.deepWorkHours}h deep work • {plan.metrics.meetingsHours}h meetings</span>
            </div>
            <PlanTimeline blocks={plan.timeBlocks} currentBlock={currentBlock} />
          </div>

          {/* Priorities */}
          <div className="glass p-4 rounded-xl">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Priorities</p>
            <ol className="space-y-2">
              {plan.priorities.map((p, i) => (
                <li key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-bg-elevated/50 transition-colors">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full border border-accent/30 flex items-center justify-center text-xs font-bold text-accent">{i + 1}</span>
                  <span className="text-text">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Bottom row: Active Habits + Recent Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Active Habits</p>
            <button className="text-xs text-accent hover:underline">View all</button>
          </div>
          <div className="space-y-2">
            {habits.slice(0, 4).map(h => (
              <HabitRow key={h.id} habit={h} compact />
            ))}
          </div>
        </div>

        <div className="glass p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Recent Notes</p>
            <button className="text-xs text-accent hover:underline">View all</button>
          </div>
          <div className="space-y-2">
            {notes.slice(0, 3).map(n => (
              <NoteRow key={n.id} note={n} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanTimeline({ blocks, currentBlock }) {
  const startHour = 6
  const endHour = 22
  const totalHours = endHour - startHour

  return (
    <div className="relative">
      {/* Time ruler */}
      <div className="flex items-end h-8 mb-2 px-2">
        {Array.from({ length: totalHours + 1 }, (_, i) => startHour + i).map(h => (
          <div key={h} className="w-[calc(100%/16)] flex justify-center">
            <span className="text-xs text-text-muted">{h}:00</span>
          </div>
        ))}
      </div>
      
      {/* Blocks */}
      <div className="relative h-20">
        {blocks.map((block, i) => {
          const left = ((block.startHour - startHour) / totalHours) * 100
          const width = ((block.endHour - block.startHour) / totalHours) * 100
          const isCurrent = block === currentBlock
          
          return (
            <div
              key={block.id}
              className="absolute top-0 rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-accent/20"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                height: isCurrent ? '100%' : '80%',
                top: isCurrent ? 0 : '20%',
                background: getTypeColor(block.type),
                zIndex: isCurrent ? 10 : 1,
              }}
              title={`${block.label} (${formatTime(block.startHour)}–${formatTime(block.endHour)})`}
            >
              {width > 15 && (
                <div className="p-1.5 h-full flex flex-col justify-between text-white text-xs font-medium truncate">
                  <span>{block.label}</span>
                  <span className="opacity-80">{formatTime(block.startHour)}–{formatTime(block.endHour)}</span>
                </div>
              )}
            </div>
          )
        })}
        
        {/* Current time indicator */}
        <CurrentTimeIndicator startHour={startHour} endHour={endHour} />
      </div>
    </div>
  )
}

function CurrentTimeIndicator({ startHour, endHour }) {
  const now = new Date()
  const currentHour = now.getHours() + now.getMinutes() / 60
  const totalHours = endHour - startHour
  const left = ((currentHour - startHour) / totalHours) * 100
  
  if (currentHour < startHour || currentHour > endHour) return null
  
  return (
    <div className="absolute top-0 bottom-0 w-px bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.8)]" style={{ left: `${left}%` }}>
      <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-white border-2 bg-bg" style={{ top: '-6px' }} />
    </div>
  )
}

function HabitRow({ habit, compact }) {
  const isDoneToday = habit.lastDone === new Date().toISOString().split('T')[0]
  
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-elevated/50 transition-colors">
      <button
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          isDoneToday 
            ? 'bg-success border-success text-white' 
            : 'border-border-hover hover:border-accent/50'
        }`}
      >
        {isDoneToday && <Icon name="Check" size={12} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">{habit.name}</p>
        <p className="text-xs text-text-muted">{habit.streak} day streak • {habit.timeBlock}</p>
      </div>
      <span className="text-xs text-text-muted">{habit.metrics.quality}/10</span>
    </div>
  )
}

function NoteRow({ note }) {
  return (
    <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-bg-elevated/50 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
        <Icon name="FileText" size={16} className="text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">{note.title}</p>
        <p className="text-xs text-text-muted truncate">{note.excerpt}</p>
        <div className="flex items-center gap-1 mt-1">
          {note.tags.slice(0, 2).map(t => (
            <span key={t} className="px-1.5 py-0.5 text-xs bg-border rounded text-text-muted">{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function QuickActions({ onAction }) {
  const actions = [
    { id: 'new-task', label: 'New Task', icon: 'Plus', color: 'accent' },
    { id: 'new-note', label: 'Capture Note', icon: 'FileText', color: 'success' },
    { id: 'start-timer', label: 'Start Timer', icon: 'Play', color: 'warning' },
    { id: 'log-habit', label: 'Log Habit', icon: 'Target', color: 'success' },
    { id: 'plan-tomorrow', label: 'Plan Tomorrow', icon: 'Calendar', color: 'accent' },
    { id: 'weekly-review', label: 'Weekly Review', icon: 'RotateCw', color: 'warning' },
  ]

  return (
    <div className="glass p-4 rounded-xl">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Quick Actions</p>
      <div className="grid grid-cols-2 gap-2">
        {actions.map(a => (
          <button
            key={a.id}
            onClick={() => onAction(a.id)}
            className="p-3 rounded-lg text-left hover:bg-bg-elevated/50 transition-colors group"
          >
            <div className={`w-8 h-8 rounded-lg bg-${a.color}/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
              <Icon name={a.icon} size={18} className={`text-${a.color}`} />
            </div>
            <p className="text-sm font-medium text-text">{a.label}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function formatTime(hour) {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function getTypeColor(type) {
  switch (type) {
    case 'deep_work': return 'bg-accent'
    case 'ritual': return 'bg-success'
    case 'shallow': return 'bg-border-hover'
    case 'buffer': return 'bg-warning'
    default: return 'bg-border'
  }
}