import { useState } from 'react'
import { Icon } from './Icons'

const workoutTypes = ['strength', 'cardio', 'mobility', 'sport', 'hiit', 'yoga', 'walking']
const healthMetrics = ['weight', 'body_fat', 'muscle_mass', 'resting_hr', 'hrv', 'blood_pressure', 'glucose', 'sleep_hours', 'sleep_quality', 'steps', 'water_ml']

export function HealthView({ health, onUpdate }) {
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState('metrics')
  const [newMetric, setNewMetric] = useState({ type: 'weight', value: '', unit: '', date: new Date().toISOString().slice(0,10), notes: '' })
  const [newWorkout, setNewWorkout] = useState({ type: 'strength', duration: 0, intensity: 'moderate', calories: 0, date: new Date().toISOString().slice(0,10), notes: '' })

  const latestWeight = health.metrics.find(m => m.type === 'weight')?.value
  const latestSleep = health.metrics.find(m => m.type === 'sleep_hours')?.value
  const totalWorkouts = health.workouts.length
  const totalDuration = health.workouts.reduce((sum, w) => sum + (w.duration || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Health</h1>
          <p className="text-text-muted">Metrics • Workouts • Sleep • Nutrition</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
          <Icon name="Plus" size={18} />
          Log Entry
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Weight" value={latestWeight ? `${latestWeight} kg` : '—'} icon="Weight" color="accent" />
        <MetricCard label="Sleep" value={latestSleep ? `${latestSleep}h` : '—'} icon="Moon" color="warning" />
        <MetricCard label="Workouts" value={totalWorkouts} icon="Dumbbell" color="success" />
        <MetricCard label="Total Time" value={`${Math.round(totalDuration/60)}h`} icon="Clock" color="accent" />
      </div>

      <div className="flex items-center gap-2 border-b border-border mb-4">
        {['metrics', 'workouts', 'sleep', 'nutrition', 'appointments'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'metrics' && <MetricList metrics={health.metrics} onUpdate={onUpdate} />}
      {activeTab === 'workouts' && <WorkoutList workouts={health.workouts} onUpdate={onUpdate} />}
      {activeTab === 'sleep' && <SleepList sleep={health.sleep} onUpdate={onUpdate} />}
      {activeTab === 'nutrition' && <NutritionList nutrition={health.nutrition} onUpdate={onUpdate} />}
      {activeTab === 'appointments' && <AppointmentList appointments={health.appointments} onUpdate={onUpdate} />}

      {showForm && (
        <HealthForm
          mode={activeTab}
          metric={newMetric}
          workout={newWorkout}
          onMetricChange={setNewMetric}
          onWorkoutChange={setNewWorkout}
          onSubmit={() => {
            if (activeTab === 'metrics' && newMetric.type && newMetric.value) {
              const m = { ...newMetric, id: `hm-${Date.now()}`, value: parseFloat(newMetric.value), date: newMetric.date }
              onUpdate({ ...health, metrics: [m, ...health.metrics] })
              setNewMetric({ type: 'weight', value: '', unit: '', date: new Date().toISOString().slice(0,10), notes: '' })
            } else if (activeTab === 'workouts' && newWorkout.type && newWorkout.duration) {
              const w = { ...newWorkout, id: `wo-${Date.now()}`, duration: parseInt(newWorkout.duration) }
              onUpdate({ ...health, workouts: [w, ...health.workouts] })
              setNewWorkout({ type: 'strength', duration: 0, intensity: 'moderate', calories: 0, date: new Date().toISOString().slice(0,10), notes: '' })
            }
            setShowForm(false)
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function MetricList({ metrics, onUpdate }) {
  const handleUpdate = (id, updates) => onUpdate(h => ({ ...h, metrics: h.metrics.map(m => m.id === id ? { ...m, ...updates } : m) }))
  return (
    <div className="glass p-4 rounded-xl">
      {metrics.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Activity" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No metrics logged yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {metrics.map(m => (
            <MetricCard key={m.id} metric={m} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function MetricCard({ metric, onUpdate }) {
  return (
    <div className="glass p-4 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
          <Icon name={getMetricIcon(metric.type)} size={20} className="text-accent" />
        </div>
        <div className="min-w-0">
          <h4 className="font-medium text-text capitalize">{metric.type.replace('_', ' ')}</h4>
          <p className="text-xs text-text-muted">{metric.date} • {metric.unit || ''}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono font-bold text-xl text-text">{metric.value} <span className="font-normal text-sm text-text-muted">{metric.unit}</span></p>
        {metric.notes && <p className="text-xs text-text-muted truncate max-w-xs">{metric.notes}</p>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-1.5 rounded hover:bg-bg-elevated text-text-muted"><Icon name="Edit" size={14} /></button>
        <button className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
      </div>
    </div>
  )
}

function WorkoutList({ workouts, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {workouts.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Dumbbell" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No workouts logged yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workouts.slice(0, 20).map(w => (
            <WorkoutCard key={w.id} workout={w} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function WorkoutCard({ workout, onUpdate }) {
  const handleUpdate = (id, updates) => onUpdate(h => ({ ...h, workouts: h.workouts.map(w => w.id === id ? { ...w, ...updates } : w) }))
  return (
    <div className="glass p-3 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
          <Icon name={getWorkoutIcon(workout.type)} size={20} className="text-success" />
        </div>
        <div>
          <h4 className="font-medium text-text capitalize">{workout.type}</h4>
          <p className="text-xs text-text-muted flex items-center gap-2">
            <span>{workout.duration} min</span>
            <span className="px-1.5 py-0.5 bg-border rounded text-text-muted capitalize">{workout.intensity}</span>
            {workout.calories && <span className="text-warning">🔥 {workout.calories} cal</span>}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm text-text-muted">{workout.date}</p>
        {workout.notes && <p className="text-xs text-text-muted truncate max-w-xs">{workout.notes}</p>}
      </div>
    </div>
  )
}

function SleepList({ sleep, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {sleep.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Moon" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No sleep entries yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sleep.slice(0, 20).map(s => (
            <SleepCard key={s.id} sleep={s} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function SleepCard({ sleep, onUpdate }) {
  return (
    <div className="glass p-3 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
          <Icon name="Moon" size={20} className="text-warning" />
        </div>
        <div>
          <p className="font-medium text-text">{sleep.hours}h {sleep.minutes || 0}m</p>
          <p className="text-xs text-text-muted">{sleep.date} • Quality: {sleep.quality || '—'}/10</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm text-text-muted">{sleep.bedtime} – {sleep.wakeTime}</p>
      </div>
    </div>
  )
}

function NutritionList({ nutrition, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {nutrition.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Apple" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No nutrition logs yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {nutrition.slice(0, 20).map(n => (
            <NutritionCard key={n.id} nutrition={n} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function NutritionCard({ nutrition, onUpdate }) {
  return (
    <div className="glass p-3 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
          <Icon name="Apple" size={20} className="text-success" />
        </div>
        <div>
          <h4 className="font-medium text-text">{nutrition.meal}</h4>
          <p className="text-xs text-text-muted">{nutrition.calories} cal • P:{nutrition.protein}g C:{nutrition.carbs}g F:{nutrition.fat}g</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm text-text-muted">{nutrition.date}</p>
      </div>
    </div>
  )
}

function AppointmentList({ appointments, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {appointments.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Calendar" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No appointments scheduled.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {appointments.map(a => (
            <AppointmentCard key={a.id} appointment={a} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function AppointmentCard({ appointment, onUpdate }) {
  return (
    <div className="glass p-3 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
          <Icon name="Calendar" size={20} className="text-accent" />
        </div>
        <div>
          <h4 className="font-medium text-text">{appointment.title}</h4>
          <p className="text-xs text-text-muted">{appointment.date} at {appointment.time} • {appointment.type}</p>
        </div>
      </div>
      <div className="text-right">
        <span className="px-2 py-0.5 text-xs bg-border rounded text-text-muted capitalize">{appointment.status}</span>
      </div>
    </div>
  )
}

function HealthForm({ mode, metric, workout, onMetricChange, onWorkoutChange, onSubmit, onCancel }) {
  if (mode === 'metrics') return <MetricForm metric={metric} onChange={onMetricChange} onSubmit={onSubmit} onCancel={onCancel} />
  if (mode === 'workouts') return <WorkoutForm workout={workout} onChange={onWorkoutChange} onSubmit={onSubmit} onCancel={onCancel} />
  return null
}

function MetricForm({ metric, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">Log Metric</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Type *</label>
          <select value={metric.type} onChange={e => onChange({...metric, type: e.target.value})} className="input">
            {healthMetrics.map(t => <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Value *</label>
            <input type="number" step="0.1" value={metric.value} onChange={e => onChange({...metric, value: e.target.value})} placeholder="70.5" className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Unit</label>
            <input type="text" value={metric.unit} onChange={e => onChange({...metric, unit: e.target.value})} placeholder="kg, hours, mmHg..." className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Date</label>
          <input type="date" value={metric.date} onChange={e => onChange({...metric, date: e.target.value})} className="input" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Notes</label>
          <input type="text" value={metric.notes} onChange={e => onChange({...metric, notes: e.target.value})} placeholder="How did you feel?" className="input" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!metric.type || metric.value === ''}>Log Metric</button>
      </div>
    </div>
  )
}

function WorkoutForm({ workout, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">Log Workout</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Type *</label>
            <select value={workout.type} onChange={e => onChange({...workout, type: e.target.value})} className="input">
              {workoutTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Duration (min) *</label>
            <input type="number" value={workout.duration} onChange={e => onChange({...workout, duration: e.target.value})} placeholder="45" className="input" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Intensity</label>
            <select value={workout.intensity} onChange={e => onChange({...workout, intensity: e.target.value})} className="input">
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Calories</label>
            <input type="number" value={workout.calories} onChange={e => onChange({...workout, calories: e.target.value})} placeholder="350" className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Date</label>
          <input type="date" value={workout.date} onChange={e => onChange({...workout, date: e.target.value})} className="input" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Notes</label>
          <input type="text" value={workout.notes} onChange={e => onChange({...workout, notes: e.target.value})} placeholder="Exercises, sets, reps..." className="input" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!workout.type || !workout.duration}>Log Workout</button>
      </div>
    </div>
  )
}

function getMetricIcon(type) {
  switch (type) {
    case 'weight': return 'Weight'
    case 'body_fat': return 'Percent'
    case 'muscle_mass': return 'Dumbbell'
    case 'resting_hr': return 'Heart'
    case 'hrv': return 'Activity'
    case 'blood_pressure': return 'Droplet'
    case 'glucose': return 'Droplet'
    case 'sleep_hours': return 'Moon'
    case 'sleep_quality': return 'Star'
    case 'steps': return 'Footprints'
    case 'water_ml': return 'Droplet'
    default: return 'Activity'
  }
}

function getWorkoutIcon(type) {
  switch (type) {
    case 'strength': return 'Dumbbell'
    case 'cardio': return 'Heart'
    case 'mobility': return 'Wind'
    case 'sport': return 'Trophy'
    case 'hiit': return 'Zap'
    case 'yoga': return 'Sparkles'
    case 'walking': return 'Footprints'
    default: return 'Dumbbell'
  }
}