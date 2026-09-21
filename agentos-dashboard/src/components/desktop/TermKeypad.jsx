// Virtual keypad for touch screens — sends ANSI/control sequences to the PTY.
// `send(data)` writes raw bytes to the terminal (via pty.write equivalent).

const SPECIAL_KEYS = [
  // { label, send, mod? }
  { label: 'Esc', send: '\x1b' },
  { label: 'Tab', send: '\t' },
  { label: 'Ctrl', send: '\x1b' }, // prefix — see handling
  { label: 'Shift', send: '' },     // prefix
  { label: 'Alt', send: '\x1b' },   // prefix
  { label: '↑', send: '\x1b[A' },
  { label: '↓', send: '\x1b[B' },
  { label: '→', send: '\x1b[C' },
  { label: '←', send: '\x1b[D' },
  { label: 'Home', send: '\x1b[H' },
  { label: 'End', send: '\x1b[F' },
  { label: 'PgUp', send: '\x1b[5~' },
  { label: 'PgDn', send: '\x1b[6~' },
  { label: 'Del', send: '\x1b[3~' },
  { label: 'Bs', send: '\x7f' },  // backspace
  { label: 'Enter', send: '\r' },
  { label: 'Space', send: ' ' },
]

// Keys that need a Ctrl/Shift/Alt prefix held: send as `\x1b[chars` etc.
// We implement simple toggles: tap Ctrl once for next key, etc. For simplicity
// the mod keys insert a prefix; the first following plain key is combined.
export function TermKeypad({ onSend }) {
  // mod state
  const modRef = { current: null }

  const press = (key) => {
    // Special: Enter / Esc / Tab / Bs etc always send their raw sequence.
    if (key.send && !['Ctrl','Shift','Alt'].includes(key.label)) {
      let out = key.send
      // If a modifier is pending, wrap. Most terminals: Ctrl+letter = key&0x1f.
      onSend(out)
      modRef.current = null
      return
    }
    if (['Ctrl','Shift','Alt'].includes(key.label)) {
      modRef.current = key.label
      return
    }
  }

  const pressPlain = (ch) => {
    let out = ch
    if (modRef.current === 'Ctrl' && /^[a-zA-Z]$/.test(ch)) {
      out = String.fromCharCode(ch.toUpperCase().charCodeAt(0) & 0x1f)  // Ctrl+letter
    } else if (modRef.current === 'Alt') {
      out = '\x1b' + ch
    } else if (modRef.current === 'Shift') {
      out = ch.toUpperCase()
    }
    onSend(out)
    modRef.current = null
  }

  const modActive = modRef.current

  return (
    <div className="bg-bg-elevated border-t border-border px-2 py-1.5 select-none">
      <div className="flex flex-wrap" style={{ gap: '4px' }}>
        {SPECIAL_KEYS.map(k => (
          <button
            key={k.label}
            onMouseDown={e => e.preventDefault()}
            onClick={() => press(k)}
            className={`px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${modActive===k.label ? 'bg-accent text-white border-accent' : 'bg-bg-card text-text border-border hover:text-accent hover:border-accent'}`}
          >
            {k.label}
          </button>
        ))}
        {/* row 2: letters+digits quick row (a-z common) */}
        {['q','w','e','r','t','y','u','i','o','p'].map(c => (
          <button key={c} onClick={() => pressPlain(c)} className="px-2.5 py-1.5 rounded text-xs border border-border text-text hover:bg-bg-card hover:border-accent">{c}</button>
        ))}
        {['a','s','d','f','g','h','j','k','l'].map(c => (
          <button key={c} onClick={() => pressPlain(c)} className="px-2.5 py-1.5 rounded text-xs border border-border text-text hover:bg-bg-card hover:border-accent">{c}</button>
        ))}
        {['z','x','c','v','b','n','m'].map(c => (
          <button key={c} onClick={() => pressPlain(c)} className="px-2.5 py-1.5 rounded text-xs border border-border text-text hover:bg-bg-card hover:border-accent">{c}</button>
        ))}
        {['0','1','2','3','4','5','6','7','8','9'].map(c => (
          <button key={c} onClick={() => pressPlain(c)} className="px-2.5 py-1.5 rounded text-xs border border-border text-text hover:bg-bg-card hover:border-accent">{c}</button>
        ))}
        {['.','-','_','/', '\\', ':',';',',','!','?','@','#'].map(c => (
          <button key={c} onClick={() => pressPlain(c)} className="px-2.5 py-1.5 rounded text-xs border border-border text-text hover:bg-bg-card hover:border-accent">{c}</button>
        ))}
        {modActive && (
          <button
            onClick={() => { modRef.current = null; }}
            className="px-2 py-1 rounded text-xs border border-accent text-white bg-accent"
          >mod: {modActive} ✕</button>
        )}
      </div>
    </div>
  )
}