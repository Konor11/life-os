import { useState } from 'react'
import { Icon } from './Icons'

export function MemoryView({ memory, onUpdate }) {
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState('documents')
  const [search, setSearch] = useState('')
  const [newDoc, setNewDoc] = useState({ content: '', source: 'manual', metadata: {} })
  const [query, setQuery] = useState('')

  const totalDocs = memory.documents?.length || 0
  const totalEmbeddings = memory.embeddings?.length || 0
  const recentQueries = (memory.queries || []).slice(0, 5)

  const filteredDocs = (memory.documents || [])
    .filter(d => d.content.toLowerCase().includes(search.toLowerCase()) || d.source.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => new Date(b.created) - new Date(a.created))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Memory / RAG</h1>
          <p className="text-text-muted">Documents • Embeddings • Semantic Search</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
            <Icon name="Plus" size={18} />
            Add Document
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Documents" value={totalDocs} icon="FileText" color="accent" />
        <MetricCard label="Embeddings" value={totalEmbeddings} icon="Database" color="success" />
        <MetricCard label="Queries" value={memory.queries.length} icon="Search" color="warning" />
        <MetricCard label="Sources" value={[...new Set(memory.documents.map(d => d.source))].length} icon="Globe" color="success" />
      </div>

      <div className="flex items-center gap-2 border-b border-border mb-4">
        {['documents', 'search', 'ingest'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'documents' && (
        <DocumentList documents={filteredDocs} search={search} setSearch={setSearch} onUpdate={onUpdate} />
      )}
      {activeTab === 'search' && (
        <SearchPanel query={query} setQuery={setQuery} memory={memory} onUpdate={onUpdate} recentQueries={recentQueries} />
      )}
      {activeTab === 'ingest' && (
        <IngestPanel memory={memory} onUpdate={onUpdate} />
      )}

      {showForm && (
        <DocumentForm
          doc={newDoc}
          onChange={setNewDoc}
          onSubmit={() => {
            if (newDoc.content.trim()) {
              const doc = { ...newDoc, id: `doc-${Date.now()}`, created: new Date().toISOString(), metadata: newDoc.metadata || {} }
              onUpdate({ ...memory, documents: [doc, ...memory.documents] })
              setNewDoc({ content: '', source: 'manual', metadata: {} })
            }
            setShowForm(false)
          }}
          onCancel={() => { setShowForm(false); setNewDoc({ content: '', source: 'manual', metadata: {} }) }}
        />
      )}
    </div>
  )
}

function DocumentList({ documents, search, setSearch, onUpdate }) {
  const handleUpdate = (id, updates) => onUpdate(m => ({ ...m, documents: m.documents.map(d => d.id === id ? { ...d, ...updates } : d) }))
  const handleDelete = (id) => onUpdate(m => ({ ...m, documents: m.documents.filter(d => d.id !== id) }))
  return (
    <div className="space-y-4">
      <div className="relative">
        <Icon name="Search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents..." className="input pl-10 w-full max-w-md" />
      </div>
      {documents.length === 0 ? (
        <div className="glass p-12 rounded-xl text-center">
          <Icon name="FileText" size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-text-muted mb-4">{search ? 'No matching documents found.' : 'No documents yet. Add your first document to build the knowledge base.'}</p>
          {!search && <button onClick={() => { /* handled by parent */ }} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors">Add Document</button>}
        </div>
      ) : (
        <div className="glass p-4 rounded-xl space-y-2">
          {documents.map(d => (
            <DocumentCard key={d.id} doc={d} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentCard({ doc, onUpdate, onDelete }) {
  const handleUpdate = (id, updates) => onUpdate(m => ({ ...m, documents: m.documents.map(d => d.id === id ? { ...d, ...updates } : d) }))
  return (
    <div className="glass p-4 rounded-lg hover:bg-bg-elevated/50 transition-colors group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded ${getSourceClass(doc.source)}`}>
              {doc.source}
            </span>
            <span className="text-xs text-text-muted">{new Date(doc.created).toLocaleDateString()}</span>
            <span className="text-xs text-text-muted">~{Math.round(doc.content.length / 1000)}k chars</span>
          </div>
          <p className="text-sm text-text-muted line-clamp-3">{doc.content}</p>
          {Object.keys(doc.metadata).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(doc.metadata).slice(0, 4).map(([k,v]) => (
                <span key={k} className="px-2 py-0.5 text-xs bg-border rounded text-text-muted">{k}: {String(v).slice(0,20)}</span>
              ))}
              {Object.keys(doc.metadata).length > 4 && <span className="px-2 py-0.5 text-xs bg-border rounded text-text-muted">+{Object.keys(doc.metadata).length - 4}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onUpdate(doc.id, { metadata: { ...doc.metadata, pinned: !doc.metadata.pinned } })} className={`p-1.5 rounded ${doc.metadata.pinned ? 'bg-warning/10 text-warning' : 'hover:bg-bg-elevated text-text-muted'}`} title={doc.metadata.pinned ? 'Unpin' : 'Pin'}>
            <Icon name="Pin" size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Copy" size={14} /></button>
          <button className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Edit" size={14} /></button>
          <button onClick={() => onDelete(doc.id)} className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
        </div>
      </div>
    </div>
  )
}

function SearchPanel({ query, setQuery, memory, onUpdate, recentQueries }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    const res = await fetch('/api/memory/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 10 })
    })
    const data = await res.json()
    setResults(data.results || [])
    setLoading(false)
    onUpdate(m => ({ ...m, queries: [{ q: query, results: data.results?.length || 0, at: new Date().toISOString() }, ...m.queries].slice(0, 50) }))
  }

  return (
    <div className="space-y-6">
      <div className="glass p-6 rounded-xl">
        <h3 className="font-semibold text-text mb-4">Semantic Search</h3>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Icon name="Search" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search your knowledge base... (e.g., 'project alpha deadline')"
              className="input pl-12"
              autoFocus
            />
          </div>
          <button onClick={handleSearch} disabled={loading || !query.trim()} className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
            {loading ? <Icon name="Loader" size={18} className="animate-spin" /> : <Icon name="Search" size={18} />}
          </button>
        </div>
        <p className="text-xs text-text-muted mt-2">Searches across all documents using text matching. Vector search coming soon.</p>
      </div>

      {results.length > 0 && (
        <div className="glass p-4 rounded-xl">
          <h4 className="font-semibold text-text mb-4">Results ({results.length})</h4>
          <div className="space-y-3">
            {results.map((r, i) => (
              <div key={r.id} className="glass p-4 rounded-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text mb-1">{r.source} • {r.content.slice(0, 200)}...</p>
                    <p className="text-xs text-text-muted">Relevance: #{i + 1}</p>
                  </div>
                  <button className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Copy" size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentQueries.length > 0 && (
        <div className="glass p-4 rounded-xl">
          <h4 className="font-semibold text-text mb-3">Recent Queries</h4>
          <div className="flex flex-wrap gap-2">
            {recentQueries.map(q => (
              <button key={q.q} onClick={() => { setQuery(q.q); handleSearch(); }} className="px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg hover:border-accent/50 hover:text-accent transition-colors truncate max-w-xs">
                {q.q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function IngestPanel({ memory, onUpdate }) {
  const [bulkText, setBulkText] = useState('')
  const [source, setSource] = useState('manual')
  const [ingesting, setIngesting] = useState(false)

  const handleIngest = async () => {
    if (!bulkText.trim()) return
    setIngesting(true)
    const chunks = bulkText.split('\n\n').filter(c => c.trim().length > 50)
    const newDocs = chunks.map(c => ({
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      content: c.trim(),
      source,
      metadata: { bulk: true, chunkSize: c.length },
      created: new Date().toISOString()
    }))
    onUpdate(m => ({ ...m, documents: [...newDocs, ...m.documents] }))
    setBulkText('')
    setIngesting(false)
  }

  return (
    <div className="glass p-6 rounded-xl space-y-6">
      <h3 className="font-semibold text-text">Bulk Ingest</h3>
      <p className="text-text-muted">Paste large text (meeting notes, articles, docs). Will split on double newlines.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Source</label>
          <select value={source} onChange={e => setSource(e.target.value)} className="input">
            <option value="manual">Manual Entry</option>
            <option value="meeting">Meeting Notes</option>
            <option value="web">Web Article</option>
            <option value="document">Document Upload</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Content</label>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            placeholder="Paste your text here... (double newlines = separate documents)"
            rows={12}
            className="input resize-y font-mono text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleIngest} disabled={ingesting || !bulkText.trim()} className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
            {ingesting ? <Icon name="Loader" size={18} className="animate-spin" /> : <Icon name="Database" size={18} />} Ingest {bulkText.split('\n\n').filter(c => c.trim().length > 50).length} Documents
          </button>
          <span className="text-xs text-text-muted">{bulkText.length} chars • {bulkText.split('\n\n').filter(c => c.trim().length > 50).length} chunks ready</span>
        </div>
      </div>

      <div className="pt-6 border-t border-border">
        <h4 className="font-medium text-text mb-3">Single Document</h4>
        <DocumentForm
          doc={{ content: '', source: 'manual', metadata: {} }}
          onChange={d => {}}
          onSubmit={() => {}}
          onCancel={() => {}}
        />
      </div>
    </div>
  )
}

function DocumentForm({ doc, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">Add Document</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Source</label>
          <select value={doc.source} onChange={e => onChange({...doc, source: e.target.value})} className="input">
            <option value="manual">Manual Entry</option>
            <option value="meeting">Meeting Notes</option>
            <option value="web">Web Article</option>
            <option value="document">Document Upload</option>
            <option value="email">Email</option>
            <option value="api">API Response</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Content *</label>
          <textarea
            value={doc.content}
            onChange={e => onChange({...doc, content: e.target.value})}
            placeholder="Paste or type your content here..."
            rows={6}
            className="input resize-y"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Metadata (JSON)</label>
          <textarea
            value={JSON.stringify(doc.metadata || {}, null, 2)}
            onChange={e => { try { onChange({...doc, metadata: JSON.parse(e.target.value) }) } catch {} }}
            placeholder='{"author": "John", "tags": ["project", "alpha"], "priority": "high"}'
            rows={4}
            className="input font-mono text-xs resize-y"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!doc.content.trim()}>Add Document</button>
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

function getSourceClass(source) {
  switch (source) {
    case 'meeting': return 'bg-warning/10 text-warning'
    case 'web': return 'bg-blue/10 text-blue'
    case 'document': return 'bg-purple/10 text-purple'
    case 'email': return 'bg-success/10 text-success'
    case 'api': return 'bg-orange/10 text-orange'
    default: return 'bg-border-hover text-text-muted'
  }
}