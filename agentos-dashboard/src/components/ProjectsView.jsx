import { useState } from 'react'
import { Icon } from './Icons'

const projectStatuses = ['backlog', 'planning', 'active', 'review', 'done']
const priorityLevels = ['low', 'medium', 'high', 'critical']

export function ProjectsView({ projects, onUpdate }) {
  const [view, setView] = useState('kanban')
  const [showForm, setShowForm] = useState(false)
  const [newProject, setNewProject] = useState({ name: '', description: '', status: 'backlog', priority: 'medium', tags: '', startDate: '', endDate: '', progress: 0 })
  const [editingId, setEditingId] = useState(null)
  const [filter, setFilter] = useState({ status: '', priority: '', tag: '' })
  const [search, setSearch] = useState('')

  const allTags = [...new Set(projects.flatMap(p => p.tags?.split(',').map(t => t.trim()).filter(Boolean) || []))]

  const filteredProjects = projects
    .filter(p => !filter.status || p.status === filter.status)
    .filter(p => !filter.priority || p.priority === filter.priority)
    .filter(p => !filter.tag || p.tags?.includes(filter.tag))
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()))

  const statusColumns = projectStatuses.map(status => ({
    id: status,
    label: status.charAt(0).toUpperCase() + status.slice(1),
    projects: filteredProjects.filter(p => p.status === status)
  }))

  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    done: projects.filter(p => p.status === 'done').length,
    overdue: projects.filter(p => p.endDate && new Date(p.endDate) < new Date() && p.status !== 'done').length
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Projects</h1>
          <p className="text-text-muted">Kanban • Timeline • Roadmap</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
            <Icon name="Plus" size={18} />
            New Project
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total" value={stats.total} icon="Folder" color="accent" />
        <MetricCard label="Active" value={stats.active} icon="Play" color="success" />
        <MetricCard label="Done" value={stats.done} icon="CheckCircle" color="success" />
        <MetricCard label="Overdue" value={stats.overdue} icon="AlertCircle" color={stats.overdue > 0 ? 'danger' : 'success'} />
      </div>

      <div className="flex flex-wrap gap-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..." className="input flex-1 min-w-[200px] max-w-xs" />
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="input w-auto">
          <option value="">All Status</option>
          {projectStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filter.priority} onChange={e => setFilter({...filter, priority: e.target.value})} className="input w-auto">
          <option value="">All Priority</option>
          {priorityLevels.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filter.tag} onChange={e => setFilter({...filter, tag: e.target.value})} className="input w-auto">
          <option value="">All Tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={view} onChange={e => setView(e.target.value)} className="input w-auto">
          <option value="kanban">Kanban</option>
          <option value="list">List</option>
          <option value="timeline">Timeline</option>
        </select>
      </div>

      {view === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {statusColumns.map(col => (
            <KanbanColumn key={col.id} column={col} onUpdate={onUpdate} />
          ))}
        </div>
      )}

      {view === 'list' && (
        <ProjectList projects={filteredProjects} onUpdate={onUpdate} onEdit={p => { setEditingId(p.id); setNewProject(p); setShowForm(true); }} />
      )}

      {view === 'timeline' && (
        <ProjectTimeline projects={filteredProjects} />
      )}

      {showForm && (
        <ProjectForm
          project={newProject}
          editing={editingId}
          onChange={setNewProject}
          onSubmit={() => {
            if (newProject.name) {
              if (editingId) {
                onUpdate(pr => ({ ...pr, projects: pr.projects.map(p => p.id === editingId ? { ...newProject, id: editingId, updated: new Date().toISOString() } : p) }))
              } else {
                const p = { ...newProject, id: `prj-${Date.now()}`, created: new Date().toISOString(), tasks: [], progress: 0 }
                onUpdate(pr => ({ ...pr, projects: [p, ...pr.projects] }))
              }
            }
            setShowForm(false)
            setEditingId(null)
          }}
          onCancel={() => { setShowForm(false); setEditingId(null); setNewProject({ name: '', description: '', status: 'backlog', priority: 'medium', tags: '', startDate: '', endDate: '', progress: 0 }) }}
        />
      )}
    </div>
  )
}

function KanbanColumn({ column, onUpdate }) {
  const handleDrop = (projectId, newStatus) => {
    onUpdate(pr => ({ ...pr, projects: pr.projects.map(p => p.id === projectId ? { ...p, status: newStatus, updated: new Date().toISOString() } : p) }))
  }

  return (
    <div className="glass p-4 rounded-xl min-h-[500px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text capitalize">{column.label}</h3>
        <span className="text-xs bg-bg-elevated px-2 py-0.5 rounded">{column.projects.length}</span>
      </div>
      <div className="flex-1 space-y-3 min-h-[400px] p-2 border-2 border-dashed border-border/50 rounded-lg"
           onDragOver={e => e.preventDefault()}
           onDrop={e => {
             e.preventDefault()
             const id = e.dataTransfer.getData('projectId')
             if (id) handleDrop(id, column.id)
           }}>
        {column.projects.map(p => (
          <ProjectCard key={p.id} project={p} onUpdate={onUpdate} />
        ))}
        {column.projects.length === 0 && (
          <div className="text-center py-8 text-text-muted">
            <Icon name="Plus" size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">Drop here</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectCard({ project, onUpdate }) {
  const isOverdue = project.endDate && new Date(project.endDate) < new Date() && project.status !== 'done'
  const priorityColors = { low: 'text-success', medium: 'text-warning', high: 'text-orange', critical: 'text-danger' }
  const priorityBg = { low: 'bg-success/10', medium: 'bg-warning/10', high: 'bg-orange/10', critical: 'bg-danger/10' }

  return (
    <div draggable className="glass p-4 rounded-lg cursor-grab hover:bg-bg-elevated/50 transition-colors border border-border"
         onDragStart={e => e.dataTransfer.setData('projectId', project.id)}>
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-semibold text-text truncate pr-2">{project.name}</h4>
        <span className={`text-xs px-2 py-0.5 rounded ${priorityBg[project.priority]} ${priorityColors[project.priority]}`}>
          {project.priority}
        </span>
      </div>
      {project.description && <p className="text-sm text-text-muted line-clamp-2 mb-3">{project.description}</p>}
      <div className="flex flex-wrap gap-1 mb-3">
        {project.tags?.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3).map(tag => (
          <span key={tag} className="px-2 py-0.5 text-xs bg-border rounded text-text-muted">{tag}</span>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-text-muted">
        {project.startDate && <span><Icon name="Calendar" size={12} /> {new Date(project.startDate).toLocaleDateString()}</span>}
        {project.endDate && <span className={isOverdue ? 'text-danger' : ''}><Icon name="Clock" size={12} /> {new Date(project.endDate).toLocaleDateString()}{isOverdue && ' (overdue)'}</span>}
      </div>
      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${project.progress || 0}%` }} />
          </div>
          <span className="text-xs font-mono text-text-muted">{project.progress || 0}%</span>
        </div>
      </div>
    </div>
  )
}

function ProjectList({ projects, onUpdate, onEdit }) {
  const handleUpdate = (id, updates) => onUpdate(pr => ({ ...pr, projects: pr.projects.map(p => p.id === id ? { ...p, ...updates } : p) }))
  const handleDelete = (id) => onUpdate(pr => ({ ...pr, projects: pr.projects.filter(p => p.id !== id) }))
  return (
    <div className="glass p-4 rounded-xl">
      {projects.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Folder" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No projects found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => (
            <div key={p.id} className="glass p-4 rounded-lg flex items-center justify-between hover:bg-bg-elevated/50 transition-colors group">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getPriorityBg(p.priority)}`}>
                  <Icon name="Folder" size={20} className={getPriorityColor(p.priority)} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-text truncate">{p.name}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded ${getPriorityBg(p.priority)} ${getPriorityColor(p.priority)}`}>{p.priority}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${p.status === 'done' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{p.status}</span>
                  </div>
                  <p className="text-sm text-text-muted truncate">{p.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                    {p.startDate && <span><Icon name="Calendar" size={12} /> {new Date(p.startDate).toLocaleDateString()}</span>}
                    {p.endDate && <span><Icon name="Flag" size={12} /> {new Date(p.endDate).toLocaleDateString()}</span>}
                    <span>{p.progress || 0}% complete</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onEdit(p)} className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Edit" size={14} /></button>
                <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectTimeline({ projects }) {
  const sorted = [...projects].sort((a,b) => new Date(a.startDate || a.created) - new Date(b.startDate || b.created))
  return (
    <div className="glass p-4 rounded-xl">
      <h3 className="font-semibold text-text mb-4">Timeline View</h3>
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Calendar" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No projects to display.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map(p => (
            <div key={p.id} className="glass p-4 rounded-lg flex items-center gap-4">
              <div className={`w-2 h-24 rounded-full ${getPriorityBg(p.priority)}`} />
              <div className="flex-1">
                <h4 className="font-semibold text-text">{p.name}</h4>
                <p className="text-sm text-text-muted">{p.startDate ? new Date(p.startDate).toLocaleDateString() : 'No start'} - {p.endDate ? new Date(p.endDate).toLocaleDateString() : 'No end'}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${getPriorityBg(p.priority)} ${getPriorityColor(p.priority)}`}>{p.priority}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectForm({ project, editing, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">{editing ? 'Edit Project' : 'New Project'}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Name *</label>
          <input type="text" value={project.name} onChange={e => onChange({...project, name: e.target.value})} placeholder="Website Redesign" className="input" autoFocus />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Description</label>
          <textarea value={project.description} onChange={e => onChange({...project, description: e.target.value})} placeholder="Project details..." rows={3} className="input resize-y" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Status</label>
            <select value={project.status} onChange={e => onChange({...project, status: e.target.value})} className="input">
              {['backlog', 'planning', 'active', 'review', 'done'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Priority</label>
            <select value={project.priority} onChange={e => onChange({...project, priority: e.target.value})} className="input">
              {['low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Start Date</label>
            <input type="date" value={project.startDate} onChange={e => onChange({...project, startDate: e.target.value})} className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">End Date</label>
            <input type="date" value={project.endDate} onChange={e => onChange({...project, endDate: e.target.value})} className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Tags (comma-separated)</label>
          <input type="text" value={project.tags} onChange={e => onChange({...project, tags: e.target.value})} placeholder="frontend, design, q3" className="input" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Progress</label>
          <input type="range" min="0" max="100" value={project.progress || 0} onChange={e => onChange({...project, progress: parseInt(e.target.value)})} className="w-full" />
          <div className="flex justify-between text-xs text-text-muted mt-1">
            <span>0%</span>
            <span>{project.progress || 0}%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!project.name}>{editing ? 'Save Changes' : 'Create Project'}</button>
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

function getPriorityColor(p) {
  switch (p) { case 'low': return 'text-success'; case 'medium': return 'text-warning'; case 'high': return 'text-orange'; case 'critical': return 'text-danger'; default: return 'text-text'; }
}
function getPriorityBg(p) {
  switch (p) { case 'low': return 'bg-success/10'; case 'medium': return 'bg-warning/10'; case 'high': return 'bg-orange/10'; case 'critical': return 'bg-danger/10'; default: return 'bg-border'; }
}