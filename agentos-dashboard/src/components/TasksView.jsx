import { useState } from 'react'
import { cn } from '../lib/utils'
import { Icon } from './Icons'

const contexts = ['@computer', '@phone', '@home', '@errands', '@waiting', '@someday']
const statuses = ['backlog', 'ready', 'in-progress', 'review', 'done']
const priorities = ['high', 'medium', 'low']

export function TasksView({ tasks, onUpdate }) {
  const [filter, setFilter] = useState('all')
  const [groupBy, setGroupBy] = useState('status')
  const [newTask, setNewTask] = useState({ title: '', project: '', context: '@computer', priority: 'medium', status: 'backlog' })
  const [showForm, setShowForm] = useState(false)

  const filteredTasks = tasks.filter(t => filter === 'all' || t.status === filter || t.context === filter || t.priority === filter)

  const grouped = filteredTasks.reduce((acc, task) => {
    const key = groupBy === 'status' ? task.status : groupBy === 'context' ? task.context : task.project || 'No Project'
    if (!acc[key]) acc[key] = []
    acc[key].push(task)
    return acc
  }, {})

  const moveTask = (taskId, newStatus) => {
    onUpdate(tasks.map(t => t.id === taskId ? {...t, status: newStatus} : t))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Tasks</h1>
          <p className="text-text-muted">GTD workflow • Kanban • Contexts</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="input w-auto">
            <option value="status">By Status</option>
            <option value="context">By Context</option>
            <option value="project">By Project</option>
          </select>
          <select value={filter} onChange={e => setFilter(e.target.value)} className="input w-auto">
            <option value="all">All</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
            <option value="backlog">Backlog</option>
            <option value="ready">Ready</option>
            <option value="in-progress">In Progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
            <Icon name="Plus" size={18} />
            New Task
          </button>
        </div>
      </div>

      {showForm && (
        <TaskForm task={newTask} onChange={setNewTask} onSubmit={() => {
          if (newTask.title) {
            const task = {...newTask, id: `T-${Date.now()}`}
            onUpdate([task, ...tasks])
            setNewTask({ title: '', project: '', context: '@computer', priority: 'medium', status: 'backlog' })
            setShowForm(false)
          }
        }} onCancel={() => setShowForm(false)} />
      )}

      {/* Kanban Board */}
      <div className="glass p-4 rounded-xl overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-4" style={{ minWidth: '800px' }}>
          {Object.entries(grouped).map(([column, columnTasks]) => (
            <TaskColumn key={column} title={column} tasks={columnTasks} onMove={moveTask} />
          ))}
          
          {/* Empty column placeholder for adding new groups */}
          {Object.keys(grouped).length === 0 && (
            <div className="w-72 flex-shrink-0 bg-bg-elevated/50 rounded-lg p-4 text-center text-text-muted border-2 border-dashed border-border-hover">
              No tasks. Click "New Task" to add one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TaskColumn({ title, tasks, onMove }) {
  const statusColors = {
    backlog: 'border-border',
    ready: 'border-success/30',
    'in-progress': 'border-accent/30',
    review: 'border-warning/30',
    done: 'border-success/30',
  }

  return (
    <div className="w-72 flex-shrink-0 flex flex-col">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-semibold text-text capitalize">{title}</h3>
        <span className="text-xs text-text-muted bg-bg-elevated px-2 py-0.5 rounded">{tasks.length}</span>
      </div>
      <div className={`flex-1 ${statusColors[title] || 'border-border'} rounded-xl p-2 min-h-[400px] space-y-2`}>
        {tasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted text-sm">
            <Icon name="Inbox" size={32} className="mb-2 opacity-50" />
            Drop tasks here
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard key={task.id} task={task} onMove={onMove} />
          ))
        )}
      </div>
    </div>
  )
}

function TaskCard({ task, onMove }) {
  const priorityColors = {
    high: 'border-l-3 border-danger',
    medium: 'border-l-3 border-warning',
    low: 'border-l-3 border-border-hover',
  }

  return (
    <div className={`glass p-3 rounded-lg ${priorityColors[task.priority]} hover:shadow-lg transition-shadow cursor-grab active:cursor-grabbing`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-text truncate flex-1">{task.title}</h4>
        <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${getPriorityClass(task.priority)}`}>
          {task.priority}
        </span>
      </div>
      {task.project && (
        <p className="text-xs text-text-muted mb-1">#{task.project}</p>
      )}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span className="px-1.5 py-0.5 bg-bg-elevated rounded">{task.context}</span>
        {task.dueDate && (
          <span className={isOverdue(task.dueDate) ? 'text-danger' : ''}>
            📅 {task.dueDate}
          </span>
        )}
        {task.nextAction && <span className="text-accent">▶ Next</span>}
      </div>
      <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border">
        {statuses.filter(s => s !== task.status).map(s => (
          <button
            key={s}
            onClick={() => onMove(task.id, s)}
            className={`text-xs px-2 py-1 rounded transition-colors ${task.status === s ? 'bg-accent text-white' : 'hover:bg-bg-elevated'}`}
          >
            {s.replace('-', ' ')}
          </button>
        ))}
      </div>
    </div>
  )
}

function TaskForm({ task, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">New Task</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs text-text-muted mb-1">Title *</label>
          <input
            type="text"
            value={task.title}
            onChange={e => onChange({...task, title: e.target.value})}
            placeholder="What needs to be done?"
            className="input"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Project</label>
          <input
            type="text"
            value={task.project}
            onChange={e => onChange({...task, project: e.target.value})}
            placeholder="Project name"
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Context</label>
          <select value={task.context} onChange={e => onChange({...task, context: e.target.value})} className="input">
            {contexts.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Priority</label>
          <select value={task.priority} onChange={e => onChange({...task, priority: e.target.value})} className="input">
            {priorities.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Status</label>
          <select value={task.status} onChange={e => onChange({...task, status: e.target.value})} className="input">
            {statuses.map(s => <option key={s} value={s}>{s.replace('-', ' ')}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!task.title}>
          Create Task
        </button>
      </div>
    </div>
  )
}

function getPriorityClass(priority) {
  switch (priority) {
    case 'high': return 'bg-danger/10 text-danger'
    case 'medium': return 'bg-warning/10 text-warning'
    default: return 'bg-border-hover text-text-muted'
  }
}

function isOverdue(dateStr) {
  return new Date(dateStr) < new Date().setHours(0,0,0,0)
}