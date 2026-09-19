import { useState } from 'react'
import { cn } from '../lib/utils'
import { Icon } from './Icons'

const frequencies = ['daily', 'weekdays', 'weekly', 'custom']

export function HabitsView({ habits, onUpdate }) {
  const [showForm, setShowForm] = useState(false)
  const [newHabit, setNewHabit] = useState({ 
    name: '', 
    identity: '', 
    frequency: 'daily', 
    timeBlock: '09:00-10:00',
    streak: 0,
    bestStreak: 0,
    lastDone: '',
    metrics: {}
  })

  const today = new Date().toISOString().split('T')[0]
  const totalStreak = habits.reduce((sum, h) => sum + h.streak, 0)
  const doneToday = habits.filter(h => h.lastDone === today).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Habits</h1>
          <p className="text-text-muted">Identity-based • Streaks • Rituals</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-success">
              <Icon name="CheckCircle" size={16} />
              <span>{doneToday}/{habits.length} done today</span>
            </div>
            <div className="flex items-center gap-1 text-accent">
              <Icon name="Flame" size={16} />
              <span>{totalStreak} total streak days</span>
            </div>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
            <Icon name="Plus" size={18} />
            New Habit
          </button>
        </div>
      </div>

      {showForm && (
        <HabitForm habit={newHabit} onChange={setNewHabit} onSubmit={() => {
          if (newHabit.name && newHabit.identity) {
            const habit = {
              ...newHabit,
              id: `H-${Date.now()}`,
              streak: 0,
              bestStreak: 0,
              lastDone: '',
              metrics: {}
            }
            onUpdate([habit, ...habits])
            setNewHabit({ name: '', identity: '', frequency: 'daily', timeBlock: '09:00-10:00', streak: 0, bestStreak: 0, lastDone: '', metrics: {} })
            setShowForm(false)
          }
        }} onCancel={() => setShowForm(false)} />
      )}

      {/* Habits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {habits.map(habit => (
          <HabitCard key={habit.id} habit={habit} today={today} onUpdate={onUpdate} />
        ))}
        
        {habits.length === 0 && (
          <div className="col-span-full glass p-12 rounded-xl text-center">
            <Icon name="Target" size={64} className="mx-auto mb-4 opacity-30" />
            <h3 className="text-xl font-semibold text-text mb-2">No habits yet</h3>
            <p className="text-text-muted mb-6">Start building your identity with tiny habits</p>
            <button onClick={() => setShowForm(true)} className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors">
              Create Your First Habit
            </button>
          </div>
        )}
      </div>

      {/* Rituals Section */}
      <div className="glass p-6 rounded-xl">
        <h3 className="font-semibold text-text mb-4 flex items-center gap-2">
          <Icon name="Sun" size={20} className="text-warning" />
          Rituals
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RitualCard 
            name="Morning Ritual"
            icon="Sunrise"
            color="warning"
            steps={[
              'Hydrate — 500ml water',
              'Movement — 10 min stretch',
              'Breath — 5 min meditation',
              'Review — Plan the day',
              'Top 1 Outcome — Write it down',
            ]}
            time="06:00-07:00"
          />
          <RitualCard 
            name="Evening Ritual"
            icon="Moon"
            color="accent"
            steps={[
              'Brain dump — Capture tasks',
              'Review — Day completion',
              'Plan Tomorrow — Top 1 + 3 MITs',
              'Log Habits — Mark done/skip',
              'Digital Sunset — Screens off',
            ]}
            time="22:00-22:30"
          />
        </div>
      </div>
    </div>
  )
}

function HabitCard({ habit, today, onUpdate }) {
  const isDoneToday = habit.lastDone === today
  const streakColor = habit.streak >= 7 ? 'text-success' : habit.streak >= 3 ? 'text-warning' : 'text-text-muted'

  const handleLog = (done) => {
    if (done && !isDoneToday) {
      onUpdate(habits => habits.map(h => h.id === habit.id ? {
        ...h,
        streak: h.streak + 1,
        bestStreak: Math.max(h.bestStreak, h.streak + 1),
        lastDone: today,
        metrics: { ...h.metrics, lastQuality: 8 }
      } : h))
    } else if (!done && isDoneToday) {
      onUpdate(habits => habits.map(h => h.id === habit.id ? {
        ...h,
        lastDone: '',
        streak: Math.max(0, h.streak - 1),
      } : h))
    }
  }

  return (
    <div className="glass p-5 rounded-xl hover:bg-bg-elevated/50 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="font-semibold text-text mb-1">{habit.name}</h3>
          <p className="text-xs text-text-muted italic">"{habit.identity}"</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-2xl ${streakColor}`}>{habit.streak}</span>
          <Icon name="Flame" size={18} className={streakColor} />
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Icon name="Clock" size={14} />
          <span>{habit.timeBlock}</span>
          <span className="px-1.5 py-0.5 bg-bg-elevated rounded capitalize">{habit.frequency}</span>
        </div>
        {habit.metrics.duration && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Icon name="Timer" size={14} />
            <span>Target: {habit.metrics.duration}min</span>
            {habit.metrics.quality && (
              <>
                <Icon name="Star" size={14} className="text-warning" />
                <span>Quality: {habit.metrics.quality}/10</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => handleLog(!isDoneToday)}
          className={`flex-1 py-2.5 rounded-lg font-medium transition-all ${
            isDoneToday
              ? 'bg-success text-white hover:bg-success/90'
              : 'bg-bg-elevated border border-border hover:border-accent/50 text-text'
          }`}
        >
          {isDoneToday ? (
            <span className="flex items-center justify-center gap-1">
              <Icon name="Check" size={16} />
              Done
            </span>
          ) : (
            'Mark Done'
          )}
        </button>
        {isDoneToday && (
          <button
            onClick={() => handleLog(false)}
            className="px-4 py-2.5 border border-danger/30 text-danger rounded-lg hover:bg-danger/10 transition-colors"
          >
            Undo
          </button>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
        <span>Best: {habit.bestStreak} days</span>
        <span>Total: {habit.streak} days</span>
      </div>
    </div>
  )
}

function HabitForm({ habit, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">New Habit</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Name *</label>
          <input
            type="text"
            value={habit.name}
            onChange={e => onChange({...habit, name: e.target.value})}
            placeholder="e.g., Morning deep work"
            className="input"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Identity Statement *</label>
          <input
            type="text"
            value={habit.identity}
            onChange={e => onChange({...habit, identity: e.target.value})}
            placeholder="I am a person who..."
            className="input"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Frequency</label>
            <select value={habit.frequency} onChange={e => onChange({...habit, frequency: e.target.value})} className="input">
              {frequencies.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Time Block</label>
            <input
              type="text"
              value={habit.timeBlock}
              onChange={e => onChange({...habit, timeBlock: e.target.value})}
              placeholder="09:00-10:00"
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Tiny Version (2-min rule)</label>
          <input
            type="text"
            placeholder="Open laptop, start timer"
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Stack After (existing habit)</label>
          <input
            type="text"
            placeholder="After coffee is ready"
            className="input"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!habit.name || !habit.identity}>
          Create Habit
        </button>
      </div>
    </div>
  )
}

function RitualCard({ name, icon, color, steps, time }) {
  return (
    <div className="glass p-4 rounded-lg border-l-4 border-current" style={{ borderColor: color }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg bg-${color}/10 flex items-center justify-center`}>
            <Icon name={icon} size={18} style={{ color }} />
          </div>
          <div>
            <h4 className="font-semibold text-text">{name}</h4>
            <p className="text-xs text-text-muted">{time}</p>
          </div>
        </div>
        <button className="p-2 rounded-lg hover:bg-bg-elevated transition-colors text-text-muted">
          <Icon name="Play" size={18} />
        </button>
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-text">
            <span className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-xs font-medium text-text-muted flex-shrink-0">{i + 1}</span>
            <span className="flex-1">{step}</span>
            <input type="checkbox" className="w-4 h-4 accent-accent rounded" />
          </li>
        ))}
      </ol>
    </div>
  )
}

function getTypeClass(type) {
  switch (type) {
    case 'permanent': return 'bg-accent/10 text-accent'
    case 'literature': return 'bg-success/10 text-success'
    case 'meeting': return 'bg-warning/10 text-warning'
    case 'project': return 'bg-purple/10 text-purple'
    default: return 'bg-border-hover text-text-muted'
  }
}