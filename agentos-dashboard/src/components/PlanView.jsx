import { useState } from 'react'
import { cn } from '../lib/utils'
import { Icon } from './Icons'

export function PlanView({ plan, onUpdate }) {
  const [editingBlock, setEditingBlock] = useState(null)
  const [newBlock, setNewBlock] = useState({ startHour: 9, endHour: 11, type: 'deep_work', label: '' })

  const totalDeepWork = plan.timeBlocks.filter(b => b.type === 'deep_work').reduce((sum, b) => sum + (b.endHour - b.startHour), 0)
  const totalMeetings = plan.timeBlocks.filter(b => b.type === 'shallow').reduce((sum, b) => sum + (b.endHour - b.startHour), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Daily Plan</h1>
          <p className="text-text-muted">Time-blocked schedule with priorities</p>
        </div>
        <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
          <Icon name="Plus" size={18} />
          Add Block
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Deep Work" value={`${totalDeepWork}h`} icon="Flame" color="accent" />
        <MetricCard label="Meetings" value={`${totalMeetings}h`} icon="Users" color="warning" />
        <MetricCard label="Blocks" value={plan.timeBlocks.length} icon="LayoutGrid" color="success" />
      </div>

      {/* Timeline Editor */}
      <div className="glass p-6 rounded-xl">
        <div className="mb-6">
          <h3 className="font-semibold text-text mb-4">Timeline</h3>
          <div className="space-y-2">
            {plan.timeBlocks.map((block, i) => (
              <TimeBlockRow
                key={block.id}
                block={block}
                index={i}
                onEdit={() => setEditingBlock(block)}
                onDelete={() => onUpdate({...plan, timeBlocks: plan.timeBlocks.filter(b => b.id !== block.id)})}
                onMoveUp={() => i > 0 && moveBlock(plan, i, -1)}
                onMoveDown={() => i < plan.timeBlocks.length - 1 && moveBlock(plan, i, 1)}
              />
            ))}
          </div>
        </div>

        {/* Add new block form */}
        <div className="border-t border-border pt-6">
          <h4 className="font-medium text-text mb-3">Add Time Block</h4>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              type="time"
              value={formatTimeInput(newBlock.startHour)}
              onChange={e => setNewBlock({...newBlock, startHour: parseTimeInput(e.target.value)})}
              className="input"
            />
            <input
              type="time"
              value={formatTimeInput(newBlock.endHour)}
              onChange={e => setNewBlock({...newBlock, endHour: parseTimeInput(e.target.value)})}
              className="input"
            />
            <select
              value={newBlock.type}
              onChange={e => setNewBlock({...newBlock, type: e.target.value})}
              className="input"
            >
              <option value="deep_work">Deep Work</option>
              <option value="shallow">Shallow Work</option>
              <option value="ritual">Ritual</option>
              <option value="buffer">Buffer</option>
            </select>
            <input
              type="text"
              placeholder="Label (e.g., Project Alpha)"
              value={newBlock.label}
              onChange={e => setNewBlock({...newBlock, label: e.target.value})}
              className="input"
            />
            <button
              onClick={() => {
                if (newBlock.label && newBlock.endHour > newBlock.startHour) {
                  const newId = `b-${Date.now()}`
                  onUpdate({
                    ...plan,
                    timeBlocks: [...plan.timeBlocks, {...newBlock, id: newId}].sort((a,b) => a.startHour - b.startHour)
                  })
                  setNewBlock({...newBlock, label: ''})
                }
              }}
              className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              disabled={!newBlock.label || newBlock.endHour <= newBlock.startHour}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Priorities */}
      <div className="glass p-6 rounded-xl">
        <h3 className="font-semibold text-text mb-4">Priorities</h3>
        <PrioritiesEditor priorities={plan.priorities} onChange={p => onUpdate({...plan, priorities: p})} />
      </div>
    </div>
  )
}

function TimeBlockRow({ block, index, onEdit, onDelete, onMoveUp, onMoveDown }) {
  const duration = Math.round((block.endHour - block.startHour) * 60)
  
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg glass hover:bg-bg-elevated/50 transition-colors group">
      <div className="w-10 text-center text-text-muted text-sm">{index + 1}</div>
      <div className={`w-3 h-3 rounded-full ${getTypeColor(block.type)} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={block.label}
            onChange={e => onUpdate({...block, label: e.target.value})}
            className="bg-transparent border-none text-text font-medium focus:outline-none flex-1"
          />
          <span className="text-xs text-text-muted px-2 py-0.5 rounded bg-bg-elevated capitalize">{block.type.replace('_', ' ')}</span>
        </div>
      </div>
      <div className="w-28 text-right text-sm text-text-muted">
        {formatTime(block.startHour)} – {formatTime(block.endHour)}
      </div>
      <div className="w-16 text-right text-sm text-text-muted">{duration}min</div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onMoveUp} className="p-1.5 rounded hover:bg-bg-elevated" title="Move up"><Icon name="ChevronUp" size={16} /></button>
        <button onClick={onMoveDown} className="p-1.5 rounded hover:bg-bg-elevated" title="Move down"><Icon name="ChevronDown" size={16} /></button>
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-bg-elevated" title="Edit"><Icon name="Edit" size={16} /></button>
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-danger/10 text-danger-hover" title="Delete"><Icon name="Trash2" size={16} /></button>
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

function PrioritiesEditor({ priorities, onChange }) {
  const [inputs, setInputs] = useState(priorities.map((p, i) => ({ id: i, text: p })))

  const handleChange = (id, text) => {
    setInputs(prev => prev.map(inp => inp.id === id ? {...inp, text} : inp))
    onChange(inputs.map(inp => inp.id === id ? text : inp.text))
  }

  const addPriority = () => {
    const newId = Date.now()
    setInputs([...inputs, { id: newId, text: '' }])
    onChange([...priorities, ''])
  }

  const removePriority = (id) => {
    const newInputs = inputs.filter(inp => inp.id !== id)
    setInputs(newInputs)
    onChange(newInputs.map(inp => inp.text))
  }

  return (
    <div className="space-y-2">
      {inputs.map((inp, i) => (
        <div key={inp.id} className="flex items-center gap-2">
          <span className="w-6 text-center text-sm font-medium text-text-muted">{i + 1}.</span>
          <input
            type="text"
            value={inp.text}
            onChange={e => handleChange(inp.id, e.target.value)}
            placeholder={`Priority ${i + 1}`}
            className="input flex-1"
          />
          <button onClick={() => removePriority(inp.id)} className="p-1.5 rounded hover:bg-danger/10 text-text-muted hover:text-danger transition-colors">
            <Icon name="X" size={16} />
          </button>
        </div>
      ))}
      <button onClick={addPriority} className="w-full py-2 border-2 border-dashed border-border-hover rounded-lg text-text-muted hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-2">
        <Icon name="Plus" size={18} />
        Add Priority
      </button>
    </div>
  )
}

function moveBlock(plan, index, direction) {
  const newBlocks = [...plan.timeBlocks]
  const newIndex = index + direction
  ;[newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]]
  onUpdate({...plan, timeBlocks: newBlocks})
}

function formatTime(hour) {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function formatTimeInput(hour) {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function parseTimeInput(str) {
  const [h, m] = str.split(':').map(Number)
  return h + (m || 0) / 60
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

function input() {
  return 'w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-text placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors'
}