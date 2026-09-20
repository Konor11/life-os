import { useState } from 'react'
import { searchMemory, ingestMemory, obsidianImport, obsidianExport } from '../data/api'
import { Icon } from './Icons'

// «Второй мозг» — Obsidian-подобный центр знаний: заметки (Zettelkasten) + RAG-память,
// wikilinks-граф связей, семантический поиск, импорт/экспорт Obsidian .md (frontmatter + [[wikilinks]]).

const NOTE_COLORS = {
  fleeting: '#e5484d', literature: '#f5a524', permanent: '#2f9e44', meeting: '#4f46e5',
  project: '#0891b2', reference: '#7c3aed', memory: '#ec4899',
}
const NOTE_ICONS = {
  fleeting: 'Zap', literature: 'BookOpen', permanent: 'Star', meeting: 'Users',
  project: 'Folder', reference: 'Link', memory: 'Database',
}

export function SecondBrainView({ notes, memory, onUpdateNotes, onUpdateMemory }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [semantic, setSemantic] = useState([])
  const [draft, setDraft] = useState(null)        // открытая заметка (редактор)
  const [mode, setMode] = useState('graph')       // graph | search | obsidian | editor
  const [flash, setFlash] = useState('')

  const allNotes = notes || []
  const docs = (memory?.documents || []).map(d => ({
    id: d.id, title: d.source || 'RAG-док', type: 'memory', content: d.content,
    tags: d.metadata?.tags || [], created: d.created,
  }))
  const allItems = [...allNotes, ...docs]

  // backlink-карта: nodeId -> [nodeId ...] (кто на неё ссылается)
  const backlinkMap = {}
  allItems.forEach(i => {
    const refs = findWikilinkTargets(i.content || '', allItems)
    refs.forEach(t => { ;(backlinkMap[t.id] = backlinkMap[t.id] || []).push(i.id) })
  })

  const flashNow = (m) => { setFlash(m); setTimeout(() => setFlash(''), 2800) }

  const runSearch = async () => {
    const q = query.trim(); if (!q) return
    setSearching(true)
    try {
      const mem = await searchMemory(q, 8)
      const fromMem = (mem?.results || []).map(r => ({ id: r.id, title: r.source || 'RAG', type: 'memory', content: r.content, rel: 'semantic' }))
      const fromNotes = allNotes.filter(n => (n.title + ' ' + n.content).toLowerCase().includes(q.toLowerCase())).map(n => ({ ...n, rel: 'text' }))
      const seen = new Set(); const merged = [...fromMem, ...fromNotes].filter(r => !seen.has(r.id) && seen.add(r.id))
      setSemantic(merged); setMode('search')
    } catch (e) { flashNow(`Ошибка поиска: ${e.message}`) } finally { setSearching(false) }
  }

  const openItem = (item) => { setDraft(JSON.parse(JSON.stringify(item))); setMode('editor') }
  const newNote = () => {
    setDraft({ id: `note-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, title: '', content: '', type: 'fleeting', tags: [], created: new Date().toISOString(), wikilinks: [] })
    setMode('editor')
  }

  const saveDraft = () => {
    if (!draft?.title?.trim()) return flashNow('Название обязательно')
    const obj = { ...draft, tags: draft.tags || [], updated: new Date().toISOString() }
    if (draft.type === 'memory') {
      onUpdateMemory(m => ({ ...m, documents: (m.documents || []).map(d => d.id === obj.id ? { ...d, content: obj.content, source: obj.title, metadata: { ...(d.metadata||{}), tags: obj.tags } } : d) }))
    } else {
      onUpdateNotes(ns => ns.some(n => n.id === obj.id) ? ns.map(n => n.id === obj.id ? obj : n) : [obj, ...ns])
    }
    flashNow('Сохранено ✓'); setMode('graph'); setDraft(null)
  }
  const deleteItem = () => {
    if (!draft?.id) return
    if (draft.type === 'memory') onUpdateMemory(m => ({ ...m, documents: (m.documents||[]).filter(d => d.id !== draft.id) }))
    else onUpdateNotes(ns => ns.filter(n => n.id !== draft.id))
    flashNow('Удалено'); setMode('graph'); setDraft(null)
  }

  const handleImport = async (filename, content) => {
    try {
      const r = await obsidianImport(filename, content)
      if (r?.ok) {
        onUpdateNotes(ns => ns.some(n => n.id === r.note.id) ? ns.map(n => n.id === r.note.id ? r.note : n) : [r.note, ...ns])
        flashNow(`Импортировано: ${r.title}${r.wikilinks?.length ? ` (+${r.wikilinks.length} wikilinks)` : ''}`)
        return r
      }
      flashNow('Ошибка импорта'); return null
    } catch (e) { flashNow(`Ошибка: ${e.message}`); return null }
  }
  const handleExport = async () => {
    try {
      const r = await obsidianExport()
      if (!r?.docs?.length) return flashNow('Нет заметок для экспорта')
      const zip = await buildSonZip(r.docs)
      if (zip) { triggerDownload(URL.createObjectURL(zip), 'life-os-vault.zip'); flashNow(`Скачан vault: ${r.count} заметок (.md)`) }
    } catch (e) { flashNow(`Ошибка экспорта: ${e.message}`) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-text flex items-center gap-2">
            <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-accent via-purple-500 to-fuchsia-500 shadow-lg shadow-accent/30 flex items-center justify-center">
              <Icon name="Brain" size={22} className="text-white" />
            </span>
            Второй мозг
          </h1>
          <p className="text-text-muted text-sm">Obsidian-стиль · заметки + RAG · граф связей · wikilinks</p>
        </div>
        <button onClick={newNote} className="px-5 py-2.5 bg-gradient-to-r from-accent to-purple-500 text-white rounded-xl shadow-lg shadow-accent/25 hover:brightness-110 flex items-center gap-2 transition-all">
          <Icon name="Plus" size={16} /> Новая заметка
        </button>
      </div>

      {flash && <div className="px-4 py-2.5 rounded-xl bg-success/10 border border-success/40 text-success text-sm flex items-center gap-2"><Icon name="CheckCircle" size={15} /> {flash}</div>}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex flex-1 gap-2 min-w-[240px]">
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder="Семантический поиск по всему мозгу..." className="flex-1 input rounded-xl" />
          <button onClick={runSearch} disabled={searching} className="px-4 rounded-xl bg-accent text-white hover:bg-accent-hover flex items-center gap-2 transition-colors">
            <Icon name="Search" size={15} /> {searching ? 'Ищу...' : 'Поиск'}
          </button>
        </div>
        <TabBtn active={mode === 'graph'} onClick={() => setMode('graph')} icon="Sparkles" label="Граф" />
        <TabBtn active={mode === 'search'} onClick={() => { setSemantic(allItems.map(i => ({ ...i, rel: 'all' }))); setMode('search') }} icon="Grid" label="Все" />
        <TabBtn active={mode === 'obsidian'} onClick={() => setMode('obsidian')} icon="Boxes" label="Obsidian" />
      </div>

      {mode === 'graph' && <BrainGraph items={allItems} backlinkMap={backlinkMap} onOpen={openItem} onNew={newNote} />}

      {mode === 'search' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {semantic.length === 0 ? (
            <div className="glass p-8 rounded-2xl text-center text-text-muted col-span-3">
              <Icon name="Brain" size={52} className="mx-auto mb-3 opacity-30" />
              <p className="text-base font-medium">Пока пусто. Создай первую заметку или захвати идею.</p>
            </div>
          ) : (
            semantic.slice(0, 30).map(r => (
              <button key={r.id} onClick={() => openItem(r)} className="glass p-4 rounded-2xl text-left hover:bg-bg-elevated/60 hover:scale-[1.01] hover:shadow-lg border border-border transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${NOTE_COLORS[r.type]}22`, color: NOTE_COLORS[r.type] }}>
                    <Icon name={NOTE_ICONS[r.type] || 'FileText'} size={15} />
                  </span>
                  <h4 className="font-semibold text-text truncate flex-1">{r.title}</h4>
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">{r.type}</span>
                </div>
                <p className="text-sm text-text-muted line-clamp-3 whitespace-pre-line">{r.content}</p>
              </button>
            ))
          )}
        </div>
      )}

      {mode === 'obsidian' && (
        <ObsidianPanel notes={allNotes} onImport={handleImport} onExport={handleExport} flashNow={flashNow} />
      )}

      {mode === 'editor' && (
        <EditorPanel draft={draft} allItems={allItems} setDraft={setDraft} onSave={saveDraft} onDelete={deleteItem} onCancel={() => { setMode('graph'); setDraft(null) }} />
      )}
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`px-3.5 py-2 rounded-xl text-sm border flex items-center gap-1.5 transition-all ${active ? 'bg-accent/15 border-accent text-accent font-medium' : 'border-border text-text-muted hover:bg-bg-elevated/60'}`}>
      <Icon name={icon} size={15} /> {label}
    </button>
  )
}

// ---- Obsidian panel ----
function ObsidianPanel({ notes, onImport, onExport, flashNow }) {
  const [files, setFiles] = useState([])
  const [sample, setSample] = useState('---\ntags: идея, zettel\ntype: permanent\n---\n# Название заметки\n\nКонтент с [[связью]] на другую заметку.')

  const onDrop = (e) => { e.preventDefault(); const arr = [...(e.dataTransfer?.files || [])].filter(f => f.name.endsWith('.md')); if (arr.length) setFiles(arr) }
  const browse = () => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.md'; i.onchange = () => setFiles([...(i.files || [])]); i.click() }
  const runImport = async () => {
    if (!files.length) return flashNow('Добавь .md файлы')
    let ok = 0
    for (const f of files) { try { const r = await onImport(f.name, await f.text()); if (r?.ok) ok++ } catch {} }
    flashNow(`Импортировано ${ok}/${files.length} файлов`); setFiles([])
  }
  const runPaste = async () => {
    if (!sample.trim()) return
    const title = sample.split('\n').find(l => l.startsWith('# '))?.slice(2).trim() || 'Untitled'
    const r = await onImport(`${title}.md`, sample); if (r?.ok) setSample('')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="glass p-5 rounded-2xl border border-border">
        <h3 className="font-semibold text-text flex items-center gap-2"><Icon name="Download" size={16} className="text-accent" /> Импорт из Obsidian</h3>
        <p className="text-xs text-text-muted mt-1">Перетащи .md файлы из vault — frontmatter и [[wikilinks]] распарсятся автоматически.</p>
        <div onDragOver={e => e.preventDefault()} onDrop={onDrop} onClick={browse}
          className="mt-4 rounded-2xl border-2 border-dashed border-border/60 p-8 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-all">
          <Icon name="Upload" size={36} className="text-text-muted mx-auto opacity-50 mb-2" />
          <p className="text-sm text-text-muted font-medium">Drop .md here or click to browse</p>
          <p className="text-xs text-text-muted mt-1">{files.length ? `${files.length} файлов: ${files.slice(0,3).map(f=>f.name).join(', ')}${files.length>3?'…':''}` : 'Obsidian Markdown vault files'}</p>
        </div>
        <button onClick={runImport} disabled={!files.length} className="mt-3 w-full py-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 flex items-center justify-center gap-2 transition-colors">
          <Icon name="Download" size={15} /> Импортировать {files.length ? `(${files.length})` : ''}
        </button>
        <div className="mt-5 pt-4 border-t border-border">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Или вставь текст</h4>
          <textarea value={sample} onChange={e => setSample(e.target.value)} rows={5} className="input resize-y font-mono text-xs" />
          <button onClick={runPaste} disabled={!sample.trim()} className="mt-2 px-4 py-2 rounded-lg border border-border text-accent hover:bg-accent/10 flex items-center gap-2 transition-colors">
            <Icon name="Zap" size={14} /> Импортировать из текста
          </button>
        </div>
      </div>

      <div className="glass p-5 rounded-2xl border border-border">
        <h3 className="font-semibold text-text flex items-center gap-2"><Icon name="Upload" size={16} className="text-accent" /> Экспорт в Obsidian</h3>
        <p className="text-xs text-text-muted mt-1">Выгрузи все заметки как Obsidian-vault (.md + frontmatter + wikilinks), затем открой папку в Obsidian.</p>
        <button onClick={onExport} className="mt-4 w-full py-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover flex items-center justify-center gap-2 transition-colors">
          <Icon name="Download" size={15} /> Скачать vault (.zip)
        </button>
        <div className="mt-5 pt-4 border-t border-border">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Текущий vault</h4>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <StatBox label="Заметки" value={notes.filter(n => n.type !== 'memory').length} color="#7c3aed" />
            <StatBox label="RAG-доки" value={notes.filter(n => n.type === 'memory').length} color="#ec4899" />
            <StatBox label="Всего" value={notes.length} color="#0891b2" />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div className="glass px-3 py-3 rounded-xl text-center">
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-text-muted mt-0.5">{label}</p>
    </div>
  )
}

// ---- Graph ----
function BrainGraph({ items, backlinkMap, onOpen, onNew }) {
  const [zoom, setZoom] = useState(1)
  const items_ = [...items].slice(0, 60)
  if (items_.length === 0) {
    return (
      <div className="glass p-10 rounded-2xl border border-border text-center">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-accent to-purple-500 shadow-xl shadow-accent/30 flex items-center justify-center mb-4"><Icon name="Brain" size={40} className="text-white" /></div>
        <h3 className="text-lg font-bold text-text">Начни второй мозг</h3>
        <p className="text-sm text-text-muted mt-2 max-w-md">Захвати идею, создай заметку или импортируй vault из Obsidian — и узлы начнут соединяться в сеть твоего знания.</p>
        <button onClick={onNew} className="px-5 py-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover flex items-center gap-2 mt-5 transition-colors"><Icon name="Plus" size={16} /> Создать заметку</button>
      </div>
    )
  }

  const nodes = {}
  items_.forEach((it, i) => {
    const ang = Math.PI * 2 * i / items_.length
    nodes[it.id] = { x: 50 + Math.cos(ang) * 42, y: 47 + Math.sin(ang) * 30, size: 2.4 + Math.min(5, (backlinkMap[it.id]?.length || 0)) * 0.5 }
  })
  const edges = []
  items_.forEach(it => {
    ;(backlinkMap[it.id] || []).forEach(src => { if (nodes[src]) edges.push({ x1: nodes[src].x, y1: nodes[src].y, x2: nodes[it.id].x, y2: nodes[it.id].y }) })
  })
  const W = 100, H = 58

  return (
    <div className="glass p-5 rounded-2xl border border-border">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-text flex items-center gap-2"><Icon name="Sparkles" size={16} className="text-accent" /> Граф связей · {items_.length} узлов · {edges.length} связей</h4>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <button onClick={() => setZoom(Math.max(0.6, zoom - 0.15))} className="w-7 h-7 rounded-lg border border-border hover:bg-bg-elevated"><Icon name="Minus" size={12} /></button>
          <span className="font-mono">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(2, zoom + 0.15))} className="w-7 h-7 rounded-lg border border-border hover:bg-bg-elevated"><Icon name="Plus" size={12} /></button>
          <button onClick={() => setZoom(1)} className="px-2 py-1 rounded-lg border border-border hover:bg-bg-elevated">Сброс</button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border" style={{ aspectRatio: '1.72', minHeight: 400, transform: `scale(${zoom})`, transformOrigin: '50% 50%' }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="absolute inset-0">
          <defs>
            <radialGradient id="brain-bg" cx="50%" cy="40%" r="75%">
              <stop offset="0%" stopColor="#1a2140" /><stop offset="100%" stopColor="#0a0e1a" />
            </radialGradient>
            <linearGradient id="edge-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a855f7" /><stop offset="100%" stopColor="#5865f2" />
            </linearGradient>
          </defs>
          <rect width={W} height={H} fill="url(#brain-bg)" />
          {edges.map((e, i) => <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="url(#edge-g)" strokeWidth="0.4" opacity="0.4" />)}
        </svg>

        {items_.map(it => {
          const n = nodes[it.id]
          const col = NOTE_COLORS[it.type] || '#7c3aed'
          const px = n.size * 9
          return (
            <button key={it.id} onClick={() => onOpen(it)}
              className="absolute origin-center -translate-x-1/2 -translate-y-1/2 rounded-full hover:scale-125 transition-transform"
              style={{ left: `${n.x + 0.2}%`, top: `${n.y + 0.2}%`, width: px, height: px }}>
              <span className="block rounded-full"
                style={{ background: `radial-gradient(circle, ${col}ee 0%, ${col}55 55%, transparent 100%)`, boxShadow: `0 0 0 1.5px ${col}88`, width: px, height: px }} />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
                style={{ color: col, fontSize: `${Math.max(8, n.size * 2.8)}px`, fontWeight: 700, textShadow: '0 0 3px rgba(0,0,0,0.45)' }}>
                {it.title.length > 16 ? it.title.slice(0, 15) + '…' : it.title}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2 mt-3 text-xs text-text-muted items-center">
        {Object.keys(NOTE_COLORS).filter(t => items_.some(i => i.type === t)).map(t => (
          <span key={t} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border" style={{ borderColor: `${NOTE_COLORS[t]}55`, color: NOTE_COLORS[t] }}>
            <Icon name={NOTE_ICONS[t] || 'FileText'} size={12} /> {t}
          </span>
        ))}
        <span className="ml-auto text-[11px] opacity-80">Размер = число связей · клик = открыть</span>
      </div>
    </div>
  )
}

// ---- Editor ----
function EditorPanel({ draft, allItems, setDraft, onSave, onDelete, onCancel }) {
  if (!draft) return <div />
  const links = findWikilinkTargets(draft.content || '', allItems)
  const col = NOTE_COLORS[draft.type] || '#7c3aed'
  return (
    <div className="glass p-5 rounded-2xl border border-border">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="font-semibold text-text flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${col}22`, color: col }}><Icon name={NOTE_ICONS[draft.type] || 'FileText'} size={15} /></span>
          {draft.title || 'Новая заметка'}
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-border text-text-muted hover:bg-bg-elevated">Закрыть</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover flex items-center gap-1.5 transition-colors"><Icon name="Check" size={14} /> Сохранить</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <input type="text" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Название" className="input rounded-lg font-semibold" disabled={draft.type === 'memory'} />
        <select value={draft.type || 'fleeting'} onChange={e => setDraft({ ...draft, type: e.target.value })} className="input rounded-lg" disabled={draft.type === 'memory'}>
          {Object.keys(NOTE_COLORS).filter(t => t !== 'memory').map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex gap-2 items-center">
          <input value={draft.tags?.join(', ') || ''} onChange={e => setDraft({ ...draft, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="теги, через ," className="flex-1 input rounded-lg" />
          {draft.type !== 'memory' && <button onClick={onDelete} className="px-2.5 py-2 rounded-lg border border-danger/40 text-danger hover:bg-danger/10" title="Удалить"><Icon name="Trash2" size={14} /></button>}
        </div>
      </div>

      <textarea value={draft.content || ''} onChange={e => setDraft({ ...draft, content: e.target.value })} rows={12}
        className="input resize-y font-mono text-sm rounded-xl min-h-[220px]"
        placeholder={'Контент заметки. Используй [[Связи]] для wikilinks на другие заметки...'} />

      {links.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex flex-wrap gap-2 items-center text-xs text-text-muted mb-1"><Icon name="Link" size={12} /> Вики-связи ({links.length}):</div>
          <div className="flex flex-wrap gap-2">
            {links.slice(0, 14).map(link => (
              <button key={link.title} onClick={() => setDraft(JSON.parse(JSON.stringify(link.item)))}
                className="px-2.5 py-1 rounded-full border border-accent/40 text-accent text-xs hover:bg-accent/10 flex items-center gap-1">
                <Icon name="Link" size={11} /> {link.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- helpers ----
// Возвращает уникальные объекты-цели wikilinks (у которых есть запись в allItems)
function findWikilinkTargets(content, allItems) {
  const out = []
  const re = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g
  const titles = new Set()
  let m
  while ((m = re.exec(content || ''))) { const t = m[1].trim(); if (t) titles.add(t) }
  allItems.forEach(i => { if (i.title && titles.has(i.title)) out.push({ title: i.title, item: i }) })
  return out
}

function triggerDownload(url, name) {
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 15000)
}

// Minimal store-only ZIP writer (RFC 1951 + central directory + EOCD)
const CRT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >> 1)) : (c >> 1); t[n] = c & 0xffffffff } return t })()
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = (c >> 8) ^ CRT[(c ^ b) & 0xff]; return (c ^ 0xffffffff) & 0xffffffff }
function u16(n) { return [(n) & 0xff, (n >> 8) & 0xff] }
function u32(n) { return [(n) & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff] }

async function buildSonZip(docs) {
  const enc = new TextEncoder()
  const files = docs.filter(d => d.fileName?.trim()).map(d => ({
    name: d.fileName.replace(/[\\/:*?"<>|]/g, '-').trim() || 'note.md',
    data: enc.encode(d.content || ''),
  }))
  const FH = 30 + 20, CDH = 46 + 20
  // 30 (local header) + name + data ; central dir ; EOCD (22)
  let off = 0
  const local = []
  const central = []
  for (const f of files) {
    const crc = crc32(f.data), n = f.name.length, d = f.data.length
    const lh = [0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x0800), ...u16(0), ...u16(0), ...u32(crc), ...u32(d), ...u32(d), ...u16(n), ...u16(0)]
    local.push(lh, [...enc.encode(f.name)], [...f.data])
    const ch = [0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x0800), ...u16(0), ...u16(0), ...u32(crc), ...u32(d), ...u32(d), ...u16(n), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]
    central.push(ch, [...enc.encode(f.name)])
    off += lh.length + n + d
  }
  const cd = [].concat(...central)
  const eocd = [0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cd.length), ...u32(off), ...u16(0)]
  const bytes = new Uint8Array([].concat(...local, cd, eocd))
  return new Blob([bytes], { type: 'application/zip' })
}