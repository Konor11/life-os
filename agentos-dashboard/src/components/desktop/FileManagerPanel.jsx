import { useState, useEffect } from 'react'
import { Icon } from '../Icons'

const API = '/api'

export function FileManagerPanel({ cwd, onCwdChange }) {
  const [path, setPath] = useState(cwd || '/root')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null) // { path, content }

  const load = async (p) => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API}/fs/ls?path=${encodeURIComponent(p)}`)
      const d = await r.json()
      if (d.error) { setError(d.error); setEntries([]) }
      else { setPath(d.path); setEntries(d.entries); onCwdChange?.(d.path) }
    } catch (e) { setError(e.message); setEntries([]) }
    setLoading(false)
  }

  useEffect(() => { load(path) }, [])

  const open = (e) => {
    const full = `${path}/${e.name}`.replace(/\/+/g,'/')
    if (e.dir) load(full)
    else readPreview(full)
  }

  const readPreview = async (full) => {
    setLoading(true); setError(null); setPreview(null)
    try {
      const r = await fetch(`${API}/fs/read?path=${encodeURIComponent(full)}`)
      const d = await r.json()
      if (d.error) setError(d.error)
      else setPreview({ path: full, ...d })
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const goUp = () => {
    if (path === '/') return
    load(path.split('/').slice(0, -1).join('/') || '/')
  }

  return (
    <div className="flex flex-col h-full bg-black/80 rounded-xl overflow-hidden border border-border text-sm" style={{ minHeight: '320px' }}>
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-elevated border-b border-border">
        <button onClick={() => load('/root')} className="px-2 py-0.5 rounded hover:bg-border text-text-muted" title="Home">🖥</button>
        <button onClick={goUp} className="px-2 py-0.5 rounded hover:bg-border text-text-muted" title="Up">↑</button>
        <span className="flex-1 text-xs text-text-muted truncate">{path}</span>
        <button onClick={() => load(path)} className="px-2 py-0.5 rounded hover:bg-border text-text-muted" title="Refresh">⟳</button>
      </div>

      {preview ? (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-accent truncate">{preview.path}</span>
            <button onClick={() => setPreview(null)} className="px-2 py-0.5 rounded hover:bg-border text-text-muted text-xs">← назад</button>
          </div>
          <pre className="flex-1 bg-bg overflow-auto p-3 rounded-lg text-xs whitespace-pre-wrap break-words">{preview.content}</pre>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {error && <div className="text-danger text-xs p-2">{error}</div>}
          {loading && <div className="text-text-muted text-xs p-2 text-center">Загрузка...</div>}
          {!loading && !error && entries.map(e => (
            <button
              key={e.name}
              onClick={() => open(e)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-elevated text-left"
            >
              <Icon name={e.dir ? 'Folder' : 'FileText'} size={16} className={e.dir ? 'text-warning' : 'text-text-muted'} />
              <span className="flex-1 truncate">{e.name}</span>
              {!e.dir && e.size !== null && <span className="text-xs text-text-muted">{fmtSize(e.size)}</span>}
            </button>
          ))}
          {!loading && !error && entries.length === 0 && <div className="text-text-muted text-xs p-2">Пусто</div>}
        </div>
      )}
    </div>
  )
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)}K`
  return `${(bytes/1024/1024).toFixed(1)}M`
}