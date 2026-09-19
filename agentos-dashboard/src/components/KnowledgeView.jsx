import { useState } from 'react'
import { cn } from '../lib/utils'
import { Icon } from './Icons'
import { KnowledgeGraph } from './KnowledgeGraph'

const noteTypes = ['fleeting', 'literature', 'permanent', 'meeting', 'project', 'reference']

export function KnowledgeView({ notes, onUpdate }) {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [viewMode, setViewMode] = useState('list')
  const [showForm, setShowForm] = useState(false)
  const [newNote, setNewNote] = useState({ title: '', type: 'fleeting', content: '', tags: '', source: '' })

  const filteredNotes = notes.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(search.toLowerCase()) || 
                          n.content.toLowerCase().includes(search.toLowerCase()) ||
                          n.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
    const matchesType = filterType === 'all' || n.type === filterType
    return matchesSearch && matchesType
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Knowledge Base</h1>
          <p className="text-text-muted">Zettelkasten • Search • Graph connections</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Icon name="Search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="input pl-10 w-64"
            />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input w-auto">
            <option value="all">All Types</option>
            {noteTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('list')} className={`px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-elevated'}`}>
              <Icon name="List" size={16} />
            </button>
            <button onClick={() => setViewMode('grid')} className={`px-2.5 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-elevated'}`}>
              <Icon name="Grid" size={16} />
            </button>
            <button onClick={() => setViewMode('graph')} className={`px-2.5 py-1.5 transition-colors ${viewMode === 'graph' ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-elevated'}`} title="Граф связей (Second Brain)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="9" r="2.4"/><circle cx="15" cy="7" r="2"/><circle cx="13" cy="15" r="2"/><path d="M9 9L15 7M9 9L13 15"/></svg>
            </button>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
            <Icon name="Plus" size={18} />
            New Note
          </button>
        </div>
      </div>

      {showForm && (
        <NoteForm note={newNote} onChange={setNewNote} onSubmit={() => {
          if (newNote.title) {
            const note = {
              ...newNote,
              id: `N-${Date.now()}`,
              tags: newNote.tags.split(',').map(t => t.trim()).filter(Boolean),
              updated: new Date().toISOString().split('T')[0],
              excerpt: newNote.content.slice(0, 120) + '...'
            }
            onUpdate([note, ...notes])
            setNewNote({ title: '', type: 'fleeting', content: '', tags: '', source: '' })
            setShowForm(false)
          }
        }} onCancel={() => setShowForm(false)} />
      )}

      {viewMode === 'graph' ? (
        <KnowledgeGraph
          notes={filteredNotes}
          onOpenNote={(n) => { setSearch(n.title); setViewMode('list') }}
        />
      ) : viewMode === 'list' ? (
        <div className="glass p-4 rounded-xl">
          <div className="space-y-2">
            {filteredNotes.map(note => (
              <NoteCard key={note.id} note={note} onUpdate={onUpdate} />
            ))}
            {filteredNotes.length === 0 && (
              <div className="text-center py-12 text-text-muted">
                <Icon name="FileText" size={48} className="mx-auto mb-4 opacity-30" />
                <p>No notes found. Create your first note!</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="glass p-4 rounded-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNotes.map(note => (
              <NoteCardGrid key={note.id} note={note} onUpdate={onUpdate} />
            ))}
            {filteredNotes.length === 0 && (
              <div className="col-span-full text-center py-12 text-text-muted">
                <Icon name="FileText" size={48} className="mx-auto mb-4 opacity-30" />
                <p>No notes found. Create your first note!</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NoteCard({ note, onUpdate }) {
  const [expanded, setExpanded] = useState(false)

  const handleUpdate = (updates) => {
    onUpdate(notes => notes.map(n => n.id === note.id ? {...n, ...updates} : n))
  }

  return (
    <div className="glass p-4 rounded-lg hover:bg-bg-elevated/50 transition-colors group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded capitalize ${getTypeClass(note.type)}`}>
              {note.type}
            </span>
            <span className="text-xs text-text-muted">{note.updated}</span>
            {note.moc && <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent">MOC</span>}
          </div>
          <h3 className="font-semibold text-text mb-1 truncate">{note.title}</h3>
          <p className="text-sm text-text-muted line-clamp-2">{note.excerpt}</p>
          {expanded && note.content && (
            <p className="text-sm text-text mt-2 pt-2 border-t border-border whitespace-pre-wrap">{note.content}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-3">
            {note.tags.slice(0, 5).map(tag => (
              <span key={tag} className="px-2 py-0.5 text-xs bg-border rounded text-text-muted">{tag}</span>
            ))}
            {note.tags.length > 5 && <span className="px-2 py-0.5 text-xs bg-border rounded text-text-muted">+{note.tags.length - 5}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded hover:bg-bg-elevated transition-colors" title={expanded ? 'Collapse' : 'Expand'}>
            <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={16} />
          </button>
          <button onClick={() => handleUpdate({...note, type: nextType(note.type)})} className="p-1.5 rounded hover:bg-bg-elevated transition-colors" title="Change type">
            <Icon name="Edit" size={16} />
          </button>
          <button className="p-1.5 rounded hover:bg-bg-elevated transition-colors" title="Link">
            <Icon name="Link" size={16} />
          </button>
          <button className="p-1.5 rounded hover:bg-danger/10 text-danger-hover transition-colors" title="Delete">
            <Icon name="Trash2" size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function NoteCardGrid({ note, onUpdate }) {
  return (
    <div className="glass p-4 rounded-lg hover:bg-bg-elevated/50 transition-colors h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs px-2 py-0.5 rounded capitalize ${getTypeClass(note.type)}`}>
          {note.type}
        </span>
        <span className="text-xs text-text-muted">{note.updated}</span>
      </div>
      <h3 className="font-semibold text-text mb-2 line-clamp-1">{note.title}</h3>
      <p className="text-sm text-text-muted flex-1 line-clamp-3">{note.excerpt}</p>
      <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border">
        {note.tags.slice(0, 4).map(tag => (
          <span key={tag} className="px-2 py-0.5 text-xs bg-border rounded text-text-muted">{tag}</span>
        ))}
        {note.tags.length > 4 && <span className="px-2 py-0.5 text-xs bg-border rounded text-text-muted">+{note.tags.length - 4}</span>}
      </div>
    </div>
  )
}

function NoteForm({ note, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">New Note</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Title *</label>
          <input
            type="text"
            value={note.title}
            onChange={e => onChange({...note, title: e.target.value})}
            placeholder="Note title"
            className="input"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Type</label>
          <select value={note.type} onChange={e => onChange({...note, type: e.target.value})} className="input">
            {noteTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Tags (comma separated)</label>
          <input
            type="text"
            value={note.tags}
            onChange={e => onChange({...note, tags: e.target.value})}
            placeholder="productivity, planning, alpha"
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Source URL (optional)</label>
          <input
            type="url"
            value={note.source}
            onChange={e => onChange({...note, source: e.target.value})}
            placeholder="https://..."
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Content</label>
          <textarea
            value={note.content}
            onChange={e => onChange({...note, content: e.target.value})}
            placeholder="Write your note here..."
            rows={6}
            className="input resize-y min-h-[120px]"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!note.title}>
          Create Note
        </button>
      </div>
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

function nextType(current) {
  const idx = noteTypes.indexOf(current)
  return noteTypes[(idx + 1) % noteTypes.length]
}