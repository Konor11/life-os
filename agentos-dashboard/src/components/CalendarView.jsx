import { useState, useEffect } from 'react'
import { Icon } from './Icons'

const eventColors = {
  meeting: 'bg-blue-500',
  task: 'bg-green-500',
  reminder: 'bg-orange-500',
  personal: 'bg-purple-500',
  work: 'bg-indigo-500',
  health: 'bg-red-500',
  default: 'bg-gray-500'
}

export function CalendarView({ calendar, onUpdate }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState('month')
  const [showForm, setShowForm] = useState(false)
  const [newEvent, setNewEvent] = useState({
    title: '',
    type: 'meeting',
    start: new Date().toISOString().slice(0,16),
    end: new Date(Date.now() + 3600000).toISOString().slice(0,16),
    allDay: false,
    color: 'meeting',
    description: '',
    location: '',
    attendees: ''
  })
  const [editingId, setEditingId] = useState(null)

  const events = calendar.events || []
  const calendars = calendar.calendars || []

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
  const prevMonthDays = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate()
  const today = new Date()

  const eventsForDay = (day, month, year) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter(e => e.start.startsWith(dateStr) || (e.end && e.end.startsWith(dateStr)))
  }

  const isToday = (day, month, year) => {
    return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Calendar</h1>
          <p className="text-text-muted">Events • Schedule • Time Blocks</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={view} onChange={e => setView(e.target.value)} className="input w-auto">
            <option value="month">Month</option>
            <option value="week">Week</option>
            <option value="day">Day</option>
            <option value="agenda">Agenda</option>
          </select>
          <button onClick={() => { setEditingId(null); setNewEvent({ title: '', type: 'meeting', start: new Date().toISOString().slice(0,16), end: new Date(Date.now() + 3600000).toISOString().slice(0,16), allDay: false, color: 'meeting', description: '', location: '', attendees: '' }); setShowForm(true); }} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
            <Icon name="Plus" size={18} />
            New Event
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-2 rounded hover:bg-bg-elevated"><Icon name="ChevronLeft" size={20} /></button>
        <h2 className="text-xl font-semibold text-text flex-1 text-center">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-2 rounded hover:bg-bg-elevated"><Icon name="ChevronRight" size={20} /></button>
      </div>

      {view === 'month' && (
        <div className="grid grid-cols-7 gap-0.5">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="p-2 text-xs text-text-muted text-center font-medium">{d}</div>
          ))}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`prev-${i}`} className="p-2 min-h-[100px] bg-bg-elevated/30">
              <div className="text-sm text-text-muted text-right">{prevMonthDays - firstDayOfMonth + i + 1}</div>
            </div>
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dayEvents = eventsForDay(day, currentDate.getMonth(), currentDate.getFullYear())
            return (
              <div key={day} className={`p-2 min-h-[100px] border border-border relative ${isToday(day, currentDate.getMonth(), currentDate.getFullYear()) ? 'bg-accent/10 ring-1 ring-accent' : ''} hover:bg-bg-elevated/50 transition-colors`}>
                <div className="text-sm font-medium text-right mb-1">{day}</div>
                <div className="space-y-1 max-h-[80px] overflow-y-auto">
                  {dayEvents.slice(0, 3).map(e => (
                    <div key={e.id} className={`text-xs px-1.5 py-0.5 rounded truncate ${eventColors[e.color] || eventColors.default} text-white cursor-pointer hover:opacity-80`} title={e.title}>
                      {e.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && <div className="text-xs text-text-muted text-center">+{dayEvents.length - 3} more</div>}
                </div>
              </div>
            )
          })}
          {Array.from({ length: 42 - firstDayOfMonth - daysInMonth }).map((_, i) => (
            <div key={`next-${i}`} className="p-2 min-h-[100px] bg-bg-elevated/30">
              <div className="text-sm text-text-muted">{i + 1}</div>
            </div>
          ))}
        </div>
      )}

      {view === 'agenda' && (
        <div className="space-y-4">
          {events
            .filter(e => new Date(e.start) >= new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))
            .filter(e => new Date(e.start) <= new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0))
            .sort((a,b) => new Date(a.start) - new Date(b.start))
            .map(e => (
              <EventCard key={e.id} event={e} onUpdate={onUpdate} onEdit={() => { setEditingId(e.id); setNewEvent(e); setShowForm(true); }} onDelete={() => onUpdate(c => ({ ...c, events: c.events.filter(ev => ev.id !== e.id) }))} />
            ))
          }
        </div>
      )}

      {showForm && (
        <EventForm
          event={newEvent}
          editing={editingId}
          onChange={setNewEvent}
          onSubmit={() => {
            if (newEvent.title && newEvent.start) {
              if (editingId) {
                onUpdate(c => ({ ...c, events: c.events.map(ev => ev.id === editingId ? { ...newEvent, id: editingId, updated: new Date().toISOString() } : ev) }))
              } else {
                const ev = { ...newEvent, id: `evt-${Date.now()}`, created: new Date().toISOString() }
                onUpdate(c => ({ ...c, events: [ev, ...c.events] }))
              }
            }
            setShowForm(false)
            setEditingId(null)
          }}
          onCancel={() => { setShowForm(false); setEditingId(null); setNewEvent({ title: '', type: 'meeting', start: new Date().toISOString().slice(0,16), end: new Date(Date.now() + 3600000).toISOString().slice(0,16), allDay: false, color: 'meeting', description: '', location: '', attendees: '' }) }}
        />
      )}
    </div>
  )
}

function EventCard({ event, onUpdate, onEdit, onDelete }) {
  return (
    <div className="glass p-4 rounded-lg flex items-center gap-4 hover:bg-bg-elevated/50 transition-colors group">
      <div className={`w-2 h-full rounded-lg ${eventColors[event.color] || eventColors.default}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h4 className="font-semibold text-text truncate">{event.title}</h4>
          <span className={`text-xs px-2 py-0.5 rounded ${eventColors[event.type] || eventColors.default} text-white capitalize`}>{event.type}</span>
        </div>
        <p className="text-sm text-text-muted flex items-center gap-2">
          <Icon name="Clock" size={14} />
          {new Date(event.start).toLocaleString()} - {event.end ? new Date(event.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'No end'}
          {event.location && <span className="mx-1">•</span>}
          {event.location && <span><Icon name="MapPin" size={12} /> {event.location}</span>}
        </p>
        {event.description && <p className="text-xs text-text-muted mt-1 line-clamp-2">{event.description}</p>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Edit" size={14} /></button>
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
      </div>
    </div>
  )
}

function EventForm({ event, editing, onChange, onSubmit, onCancel }) {
  const eventTypes = ['meeting', 'task', 'reminder', 'personal', 'work', 'health']
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">{editing ? 'Edit Event' : 'New Event'}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Title *</label>
          <input type="text" value={event.title} onChange={e => onChange({...event, title: e.target.value})} placeholder="Team meeting" className="input" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Type</label>
            <select value={event.type} onChange={e => onChange({...event, type: e.target.value})} className="input">
              {eventTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Color</label>
            <select value={event.color} onChange={e => onChange({...event, color: e.target.value})} className="input">
              {Object.keys(eventColors).map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Start *</label>
            <input type="datetime-local" value={event.start} onChange={e => onChange({...event, start: e.target.value})} className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">End</label>
            <input type="datetime-local" value={event.end} onChange={e => onChange({...event, end: e.target.value})} className="input" />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={event.allDay} onChange={e => onChange({...event, allDay: e.target.checked})} className="accent-accent" />
            <span className="text-sm text-text">All day</span>
          </label>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Location</label>
          <input type="text" value={event.location} onChange={e => onChange({...event, location: e.target.value})} placeholder="Conference room / Zoom link" className="input" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Attendees (emails, comma-separated)</label>
          <input type="text" value={event.attendees} onChange={e => onChange({...event, attendees: e.target.value})} placeholder="alice@company.com, bob@company.com" className="input" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Description</label>
          <textarea value={event.description} onChange={e => onChange({...event, description: e.target.value})} placeholder="Agenda, notes..." rows={3} className="input resize-y" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!event.title || !event.start}>{editing ? 'Save Changes' : 'Create Event'}</button>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon, color }) {
  return (
    <div className="glass p-4 rounded-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-text mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl bg-${color}/10 flex items-center justify-center`}>
          <Icon name={icon} size={24} className={`text-${color}`} />
        </div>
      </div>
    </div>
  )
}