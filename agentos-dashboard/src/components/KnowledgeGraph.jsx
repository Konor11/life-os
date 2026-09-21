import { useState } from 'react'

// Second Brain graph view — Obsidian-style connected notes visualization.
// Renders notes as nodes on a canvas, connected by shared tags/links.
// Each note node links to its own note detail.
export function KnowledgeGraph({ notes, onOpenNote }) {
  const [focused, setFocused] = useState(null) // note id under cursor/highlight

  // Build graph
  const NODE_W = 130, NODE_H = 60
  const nodes = notes.map((n, i) => {
    // deterministic position from index
    const angle = (i / Math.max(notes.length, 1)) * Math.PI * 2
    const cx = 50 + 40 * Math.cos(angle)
    const cy = 50 + 40 * Math.sin(angle)
    return { ...n, x: cx, y: cy }
  })

  const tagMap = {}
  for (const n of notes) for (const t of (n.tags || [])) (tagMap[t] ||= []).push(n.id)

  // edges: shared tags
  const edges = []
  for (const t of Object.keys(tagMap)) {
    const ids = tagMap[t]
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      edges.push([ids[a], ids[b], t])
    }
  }
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]))

  if (!notes.length) {
    return <div className="text-text-muted text-sm p-8 text-center">Нет заметок для графа. Создай заметки через вкладку Notes или Agent Tools.</div>
  }

  return (
    <div className="relative overflow-auto rounded-lg" style={{ height: '460px', background: 'rgb(var(--term-bg))', border: '1px solid rgb(var(--term-border))' }}>
      <svg width="100%" height="100%" style={{ minWidth: '560px', minHeight: '420px' }} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {/* edges */}
        {edges.map(([a, b], ei) => (
          <line key={ei} x1={nodeById[a]?.x} y1={nodeById[a]?.y} x2={nodeById[b]?.x} y2={nodeById[b]?.y}
            stroke={focused && (focused===a || focused===b) ? '#5865f2' : '#2a2f3a'} strokeWidth="0.4" />
        ))}
        {/* nodes */}
        {nodes.map(n => {
          const f = focused === n.id
          return (
            <g key={n.id} onClick={() => onOpenNote(n)} onMouseEnter={() => setFocused(n.id)} onMouseLeave={() => setFocused(null)}
              style={{ cursor: 'pointer' }}>
              <rect x={n.x - NODE_W/2} y={n.y - NODE_H/2} width={NODE_W} height={NODE_H} rx="3"
                fill={f ? '#5865f2' : '#171a21'} stroke={f ? '#fff' : '#3a3f4a'} strokeWidth={f ? 0.6 : 0.3} />
              <text x={n.x} y={n.y - 2} textAnchor="middle" fontSize="2.6" fill="#e7e9ee" fontWeight="600">{trunc(n.title, 18)}</text>
              <text x={n.x} y={n.y + 7} textAnchor="middle" fontSize="2" fill="#8a8f9c">{n.type}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function trunc(s, n) { return s && s.length > n ? s.slice(0, n-1) + '…' : s }