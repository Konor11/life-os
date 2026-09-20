import { useState, useRef, useEffect } from 'react'
import { searchMemory, ingestMemory } from '../data/api'
import { Icon } from './Icons'

// "Второй мозг" — объединённая система заметок: Knowledge (Zettelkasten) + Memory (RAG) +
// быстрый захват + семантический поиск + связи (backlinks) между заметками.

export function SecondBrainView({ notes, memory, onUpdateNotes, onUpdateMemory }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [semanticResults, setSemanticResults] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showCapture, setShowCapture] = useState(false)
  const [capture, setCapture] = useState({ title: '', content: '', tags: '', toMemory: false })
  const [mode, setMode] = useState('graph') // graph | search | read
  const [flash, setFlash] = useState('')

  const allNotes = notes || []
  const allDocs = (memory?.documents || [])
    .map(d => ({ id: d.id, title: d.source || 'Memory doc', type: 'memory', content: d.content, tags: d.metadata?.tags || [], created: d.created, color: '#a855f7' }))

  // Связи: заметки, которые упоминают заголовок другой заметки → backlink
  const linkMap = {}
  allNotes.forEach(n => {
    allNotes.forEach(m => {
      if (n.id !== m.id && (n.content || '').includes(m.title)) {
        ;(linkMap[m.id] = linkMap[m.id] || []).push(n.id)
      }
    })
  })

  const selected = allNotes.find(n => n.id === selectedId) || allDocs.find(d => d.id === selectedId)

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    try {
      // 1) semantic по Memory
      const mem = await searchMemory(q, 6)
      const semantic = (mem?.results || []).map(r => ({ id: r.id, title: r.source || 'Memory', type: 'memory', content: r.content, relevance: 'semantic' }))
      // 2) текстовый по заметкам
      const local = allNotes
        .filter(n => n.title.toLowerCase().includes(q.toLowerCase()) || n.content.toLowerCase().includes(q.toLowerCase()))
        .map(n => ({ ...n, relevance: 'text' }))
      // дедуп по id
      const seen = new Set()
      const merged = [...semantic, ...local].filter(r => !seen.has(r.id) && seen.add(r.id))
      setSemanticResults(merged)
      setMode('search')
    } catch (e) { setFlash(`Ошибка поиска: ${e.message}`); setTimeout(() => setFlash(''), 3000) }
    finally { setSearching(false) }
  }

  const handleCapture = async () => {
    if (!capture.content.trim()) return
    if (capture.toMemory) {
      const r = await ingestMemory(capture.content, capture.title || 'quick-capture', { tags: capture.tags })
      if (r?.ok) { onUpdateMemory(m => ({ ...m, documents: [...(m.documents || []), { id: r.id, content: capture.content, source: capture.title || 'quick-capture', created: new Date().toISOString() }] })) }
    } else {
      const note = { id: `note-${Date.now()}`, title: capture.title || 'Untitled', content: capture.content, type: 'fleeting', tags: capture.tags ? capture.tags.split(',').map(t => t.trim()) : [], created: new Date().toISOString() }
      onUpdateNotes(ns => [note, ...(ns || [])])
    }
    setCapture({ title: '', content: '', tags: '', toMemory: false })
    setShowCapture(false)
    setFlash(capture.toMemory ? 'Сохранено в Memory' : 'Заметка создана')
    setTimeout(() => setFlash(''), 2500)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text flex items-center gap-2"><Icon name="Brain" size={22} className="text-accent" /> Второй мозг</h1>
          <p className="text-text-muted">Заметки + RAG-память • семант. поиск • связи между идеями</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCapture(true)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover flex items-center gap-2 transition-colors">
            <Icon name="Plus" size={16} /> Быстрый захват
          </button>
        </div>
      </div>

      {flash && <div className="px-4 py-2 rounded-lg bg-success/10 border border-success/40 text-success text-sm flex items-center gap-2"><Icon name="CheckCircle" size={16} /> {flash}</div>}

      {/* Global search bar */}
      <div className="flex gap-2">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()}
          placeholder="Искать по всем заметкам и памяти (семантически)..." className="flex-1 input" />
        <button onClick={runSearch} disabled={searching} className="px-5 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover flex items-center gap-2 transition-colors">
          <Icon name="Search" size={16} /> {searching ? 'Ищу...' : 'Поиск'}
        </button>
        <button onClick={() => setMode('graph')} className={`px-4 py-2 rounded-lg border ${mode === 'graph' ? 'bg-accent/10 border-accent text-accent' : 'border-border text-text-muted hover:bg-bg-elevated'}`}>Граф</button>
        <button onClick={() => { setSemanticResults(allNotes.concat(allDocs)); setMode('search') }} className={`px-4 py-2 rounded-lg border ${mode === 'search' ? 'bg-accent/10 border-accent text-accent' : 'border-border text-text-muted hover:bg-bg-elevated'}`}>Все</button>
      </div>

      {/* Quick capture */}
      {showCapture && (
        <div className="glass p-4 rounded-xl space-y-3 border border-accent/30">
          <h4 className="font-semibold text-text flex items-center gap-2"><Icon name="Zap" size={16} className="text-accent" /> Быстрый захват идеи</h4>
          <input type="text" value={capture.title} onChange={e => setCapture({ ...capture, title: e.target.value })} placeholder="Заголовок (необязательно)" className="input" autoFocus />
          <textarea value={capture.content} onChange={e => setCapture({ ...capture, content: e.target.value })} placeholder="Запиши мысль, идею, фрагмент..." rows={3} className="input resize-y" />
          <div className="flex items-center gap-3">
            <input type="text" value={capture.tags} onChange={e => setCapture({ ...capture, tags: e.target.value })} placeholder="теги, через запятую" className="flex-1 input" />
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
              <input type="checkbox" checked={capture.toMemory} onChange={e => setCapture({ ...capture, toMemory: e.target.checked })} className="accent-accent" />
              в RAG-память
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={() => setShowCapture(false)} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated">Отмена</button>
            <button onClick={handleCapture} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover" disabled={!capture.content.trim()}>Сохранить</button>
          </div>
        </div>
      )}

      {mode === 'graph' && <BrainGraph notes={allNotes} docs={allDocs} linkMap={linkMap} onSelect={id => { setSelectedId(id); setMode('read') }} />}

      {mode === 'search' && (
        <div className="glass p-4 rounded-xl">
          {semanticResults.length === 0 ? (
            <div className="text-center py-10 text-text-muted">
              <Icon name="Brain" size={48} className="mx-auto mb-3 opacity-30" />
              <p>Нет результатов. <button onClick={() => setShowCapture(true)} className="text-accent underline hover:underline-offset-2">Захвати первую идею</button></p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {semanticResults.slice(0, 30).map(r => (
                <button key={r.id} onClick={() => { setSelectedId(r.id); setMode('read') }} className="glass p-4 rounded-lg text-left hover:bg-bg-elevated/50 border border-border transition-colors group">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${r.type === 'memory' ? 'bg-danger' : 'bg-accent'}`} />
                    <h4 className="font-semibold text-text truncate flex-1">{r.title}</h4>
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">{r.relevance}</span>
                  </div>
                  <p className="text-sm text-text-muted line-clamp-3">{r.content}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'read' && selected && (
        <ReaderView item={selected} linkMap={linkMap} allNotes={allNotes} onSelect={id => setSelectedId(id)} onClose={() => setMode('graph')} onUpdate={onUpdateNotes} />
      )}
    </div>
  )
}

// Граф связей: визуализация заметок + их backlinks (SVG-линки)
function BrainGraph({ notes, docs, linkMap, onSelect }) {
  const W = 100, scale = 10
  const items = [...notes, ...docs].slice(0, 40)
  if (items.length === 0) {
    return (
      <div className="glass p-4 rounded-xl text-center py-10 text-text-muted">
        <Icon name="Brain" size={48} className="mx-auto mb-3 opacity-30" />
        <p>Пока пусто. Создай первую заметку или захвати идею — и она появится на графе связей.</p>
      </div>
    )
  }
  // позиции по кругу
  const pos = {}
  items.forEach((it, i) => {
    const ang = (i / Math.max(items.length, 1)) * 2 * Math.PI
    pos[it.id] = { x: 50 + Math.cos(ang) * 42, y: 50 + Math.sin(ang) * 30 }
  })
  const edges = []
  items.forEach(it => {
    ;(linkMap[it.id] || []).forEach(nid => { if (pos[nid]) edges.push({ from: pos[it.id], to: pos[nid] }) })
  })
  return (
    <div className="glass p-4 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-text flex items-center gap-2"><Icon name="Sparkles" size={16} className="text-accent" /> Граф связей знаний</h4>
        <span className="text-xs text-text-muted">{items.length} узлов · {edges.length} связей</span>
      </div>
      <div className="relative aspect-video rounded-lg overflow-hidden bg-bg-elevated/40 border border-border" style={{ minHeight: 340 }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${W * 0.6}`}>
          {edges.map((e, i) => <line key={i} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} stroke="#5865f2" strokeWidth="0.6" opacity="0.35" />)}
        </svg>
        {items.map(it => {
          const p = pos[it.id]
          const deg = linkMap[it.id]?.length || 0
          const r = 2.2 + Math.min(deg, 6) * 0.5
          return (
            <button key={it.id} onClick={() => onSelect(it.id)}
              className="absolute origin-center transform -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-bg-elevated hover:bg-accent/20 transition-transform hover:scale-110"
              style={{ left: `${p.x + 0 * 1}%`, top: `${(p.y / 1.6667)}%`, width: r * scale, height: r * scale, borderColor: it.type === 'memory' ? '#ef4444' : '#a855f7' }} title={it.title}>
              <span className="sr-only">{it.title}</span>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-text-muted mt-2 flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-accent" /> Заметка
        <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-danger inline-block ml-3" /> RAG-память
        <span className="ml-auto">Размер узла = число связей · клик = открыть</span>
      </p>
    </div>
  )
}

function ReaderView({ item, linkMap, allNotes, onSelect, onClose, onUpdate }) {
  const backlinks = (linkMap[item.id] || []).map(nid => allNotes.find(n => n.id === nid)).filter(Boolean)
  const fromLinks = (item.content || '').split(/\s+/).filter(w => allNotes.some(n => n.title.toLowerCase() === w.replace(/[^A-Za-zА-Яа-я0-9_]+/g, '').toLowerCase() && n.id !== item.id))
  const extractPreview = allNotes.slice(0, 8)

  return (
    <div className="glass p-4 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[11px] uppercase px-2 py-1 rounded bg-bg-elevated ${item.type === 'memory' ? 'text-danger' : 'text-accent'}`}>{item.type}</span>
          <Icon name="BookOpen" size={16} className="text-text-muted" />
          <h3 className="font-semibold text-text truncate flex-1">{item.title}</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted"><Icon name="X" size={16} /></button>
      </div>
      <div className="whitespace-pre-wrap text-sm text-text leading-relaxed">{item.content}</div>
      {backlinks.length > 0 && (
        <div className="pt-3 border-t border-border">
          <h5 className="text-xs font-semibold text-text-muted mb-2 flex items-center gap-1"><Icon name="Link" size={12} /> На эту заметку ссылаются:</h5>
          <div className="flex flex-wrap gap-2">
            {backlinks.map(b => (
              <button key={b.id} onClick={() => onSelect(b.id)} className="px-2 py-1 text-xs border border-border rounded-full text-accent hover:bg-accent/10">{b.title}</button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-text-muted">{item.created ? new Date(item.created).toLocaleDateString('ru-RU') : ''} · {(item.content || '').split(/\s+/).length} слов</p>
    </div>
  )
}