import { useState, useRef, useEffect } from 'react'
import { TermKeypad } from './TermKeypad'

const API = '/api'

export function TerminalPanel({ cwd, onCwdChange }) {
  const [lines, setLines] = useState([
    { text: '┌─ Hermes Desktop Linux Shell ────────────────────────┐', type: 'muted' },
    { text: '│ sandbox: /root • /tmp • /home                       │', type: 'muted' },
    { text: '│ команды: ls, cd, cat, pwd, echo, mkdir...           │', type: 'muted' },
    { text: '└──────────────────────────────────────────────────────┘', type: 'muted' },
    { text: '', type: 'muted' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [dir, setDir] = useState(cwd || '/root')
  const [fontSize, setFontSize] = useState(13)
  const [keypadOn, setKeypadOn] = useState(true)
  const [hist, setHist] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  const runCmd = async (rawCmd) => {
    const cmd = rawCmd.trim()
    if (!cmd || busy) return
    if (cmd !== 'clear') {
      setLines(prev => [...prev, { text: `${dir}$ ${cmd}`, type: 'cmd' }])
      setHist(prev => [...prev, cmd])
      setHistIdx(-1)
    } else {
      setLines([]); setInput(''); setBusy(false); return
    }
    setInput('')
    setBusy(true)
    if (cmd.startsWith('cd ')) {
      const target = cmd.slice(3).trim() || '/root'
      const next = target.startsWith('/') ? target : `${dir}/${target}`.replace(/\/+/g,'/')
      setDir(next); onCwdChange?.(next)
      setLines(prev => [...prev, { text: '', type: 'out' }])
      setBusy(false)
      return
    }
    try {
      const r = await fetch(`${API}/terminal`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ command: cmd, cwd: dir }) })
      const d = await r.json()
      setLines(prev => [...prev, { text: d.output || '(no output)', type: 'out' }])
    } catch (e) {
      setLines(prev => [...prev, { text: `ERROR: ${e.message}`, type: 'err' }])
    }
    setBusy(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runCmd(input) }
    else if (e.key === 'ArrowUp') {
      e.preventDefault(); const ni = histIdx < 0 ? hist.length - 1 : Math.max(0, histIdx - 1)
      if (hist[ni] !== undefined) { setHistIdx(ni); setInput(hist[ni]) }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); const ni = histIdx + 1
      if (ni >= hist.length) { setHistIdx(-1); setInput('') }
      else { setHistIdx(ni); setInput(hist[ni]) }
    }
  }

  const sendToInput = (data) => {
    if (data === '\r' || data === '\n') return runCmd(input)
    if (data === '\x7f') return setInput(input.slice(0, -1))
    if (data === '\t') return setInput(input + '  ')
    if (data === '\x1b[A') return null
    // plain letters / symbols: append + refocus
    setInput(input + data)
    inputRef.current?.focus()
  }

  const changeFont = (delta) => setFontSize(prev => Math.min(28, Math.max(9, prev + delta)))

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border border-border font-mono"
      style={{ background: '#0b0e14', minHeight: '300px' }}>
      {/* header */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ background: 'linear-gradient(180deg,#161b26,#10141d)', borderBottom: '1px solid #232a3a' }}>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background:'#ff5f56' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background:'#ffbd2e' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background:'#27c93f' }} />
          <span className="ml-2 text-xs" style={{ color:'#7d8590' }}>bash — {dir}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => changeFont(-1)} className="px-2 py-0.5 rounded text-sm" style={{ color:'#7d8590' }} title="Меньше">−</button>
          <span className="text-xs px-1" style={{ color:'#7d8590' }}>{fontSize}</span>
          <button onClick={() => changeFont(1)} className="px-2 py-0.5 rounded text-sm" style={{ color:'#7d8590' }} title="Больше">+</button>
          <button onClick={() => setKeypadOn(!keypadOn)} className={`ml-1 px-2 py-0.5 rounded text-xs border ${keypadOn ? 'text-white' : ''}`}
            style={keypadOn ? { background:'#2f81f7', borderColor:'#2f81f7' } : { color:'#7d8590', borderColor:'#232a3a' }} title="Клавиатура">⌨</button>
        </div>
      </div>

      {/* output */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight:'200px' }}>
        {lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap break-words" style={{
            fontSize,
            lineHeight: 1.35,
            color: l.type==='cmd' ? '#58a6ff' : l.type==='err' ? '#f85149' : l.type==='muted' ? '#8b949e' : '#c9d1d9'
          }}>{l.text || '\u00A0'}</div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* input row */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop:'1px solid #232a3a', background:'#10141d' }}>
        <span style={{ color:'#3fb950' }} className="select-none">{dir}$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1 bg-transparent outline-none"
          style={{ color:'#e6edf3', fontSize }}
          placeholder="введите команду..."
          disabled={busy}
          autoFocus
        />
        <button onClick={() => runCmd(input)} disabled={busy}
          className="px-3 py-1 rounded text-xs text-white disabled:opacity-50"
          style={{ background:'#2f81f7' }}>{busy ? '…' : 'Run'}</button>
      </div>

      {/* keypad */}
      {keypadOn && <TermKeypad onSend={sendToInput} />}
    </div>
  )
}