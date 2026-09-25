import { useState, useRef, useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { WebglAddon } from '@xterm/addon-webgl'

// Terminal container background matches the Life OS theme (painted so any
// fractional-DPR gaps between rows blend into the terminal, not the page).
function getXtermBg() {
  return document.documentElement.getAttribute('data-theme') !== 'light' ? '#0b0e14' : '#ffffff'
}

export function SplitPaneView({ fullscreen = false }) {
  const [sizes, setSizes] = useState([40, 30, 30])
  const term1Ref = useRef(null)
  const fit1Ref = useRef(null)
  const term2Ref = useRef(null)
  const fit2Ref = useRef(null)
  const term3Ref = useRef(null)
  const fit3Ref = useRef(null)
  const [debug, setDebug] = useState('mounting')
  // Separate refs for init tracking (termRef.current holds the DOM div, NOT the Terminal)
  const initedRef = useRef(new Set())
  const termInstances = useRef({})  // engine -> { term, ws }
  const resizeHandlerRef = useRef(null)
  const isMobileRef = useRef(window.innerWidth < 1024)

  // Initialize three terminals with different engines
  useEffect(() => {
    setDebug('useEffect running')
    console.log('[SplitPaneView] useEffect START')
    
    const initTerm = (termRef, fitRef, engine, profile) => {
      // termRef.current holds the DOM <div> (attached by React) — do NOT use it
      // as an init guard. Track initialized engines in a separate Set instead.
      if (initedRef.current.has(engine)) return
      initedRef.current.add(engine)
      console.log(`[SplitPaneView] initTerm called for ${engine}`)
      setDebug(`init ${engine}`)
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 11,
        lineHeight: 1,
        fontFamily: 'monospace',
        scrollback: 2000,
        cols: 120,
        rows: 40,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      try {
        import('@xterm/addon-unicode11').then(({ Unicode11Addon }) => {
          term.loadAddon(new Unicode11Addon())
          term.unicode.activeVersion = '11'
        }).catch(() => {})
      } catch {}
      try {
        term.open(termRef.current)
        console.log(`[SplitPaneView] term.open SUCCESS for ${engine}, rows=${term.rows}, cols=${term.cols}`)
      } catch (e) {
        console.error(`[SplitPaneView] term.open FAILED for ${engine}:`, e)
      }
      requestAnimationFrame(() => {
        try {
          const wgl = new WebglAddon()
          wgl.onContextLoss(() => { try { wgl.dispose() } catch {} })
          term.loadAddon(wgl)
        } catch (e) {}
      })
      fitRef.current = { term, fit }
      termInstances.current[engine] = { term, ws: null }

      // Size the terminal to its pane BEFORE spawning the PTY, so the TUI boots
      // at the exact real size (fixed 120x40 left black space on wide panes and
      // clipped output on narrow/mobile ones).
      let cols = 120, rows = 40
      try {
        termRef.current.style.width = '100%'
        termRef.current.style.height = '100%'
        fit.fit()
        cols = Math.max(20, Math.min(300, term.cols))
        rows = Math.max(10, Math.min(300, term.rows))
      } catch (e) { console.warn(`[SplitPaneView] fit failed for ${engine}, fallback 120x40:`, e) }

      // Connect to TUI WebSocket
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${proto}//${location.host}/ws/tui?engine=${engine}&profile=${profile}&cols=${cols}&rows=${rows}`
      console.log(`[SplitPaneView] connecting WS for ${engine}:`, wsUrl)
      const ws = new WebSocket(wsUrl)
      termInstances.current[engine].ws = ws
      ws.onopen = () => {
        console.log(`[SplitPaneView] WS connected for ${engine}`)
        term.reset()
        term.writeln('\x1b[2J\x1b[H')
        // NOTE: no post-boot refit here — resizing while the TUI draws its
        // welcome screen corrupts the render (ghosted/doubled glyphs on
        // fractional-DPR screens). The PTY boots at the exact fitted size;
        // only genuine window resizes (debounced below) re-fit afterwards.
      }
      ws.onerror = (e) => {
        console.error(`[SplitPaneView] WS error for ${engine}:`, e)
      }
      ws.onclose = (e) => {
        console.log(`[SplitPaneView] WS closed for ${engine}:`, e.code, e.reason)
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'data') term.write(msg.data)
          else if (msg.type === 'exit') term.writeln(`\r\n\x1b[31m[TUI exited code ${msg.code}]\x1b[0m`)
        } catch { term.write(String(ev.data)) }
      }
      term.onData((data) => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'input', data }))
      })
      return () => {
        try { ws.close() } catch {}
        try { term.dispose() } catch {}
      }
    }

    // Wait for all refs to be attached, AND for the drawer close animation
    // (~200ms) + font load to finish, so the one-time fit measures the final
    // pane size. Fitting mid-animation produced wrong cols/rows on mobile.
    const startDelay = setTimeout(() => {
      const checkRefs = () => {
      if (term1Ref.current && term2Ref.current && term3Ref.current) {
        console.log('[SplitPaneView] All refs attached, initializing...')
        try {
          initTerm(term1Ref, fit1Ref, 'opencode', 'coordinator')
        } catch (e) { setDebug(`ERROR opencode: ${e?.message || e}`); console.error('[SplitPaneView] initTerm opencode FAILED:', e); return }
        try {
          initTerm(term2Ref, fit2Ref, 'hermes', 'planner')
        } catch (e) { setDebug(`ERROR hermes: ${e?.message || e}`); console.error('[SplitPaneView] initTerm hermes FAILED:', e); return }
        try {
          initTerm(term3Ref, fit3Ref, 'claude', 'tasks')
        } catch (e) { setDebug(`ERROR claude: ${e?.message || e}`); console.error('[SplitPaneView] initTerm claude FAILED:', e); return }
        setDebug('initialized')

        // Live resize: refit every terminal and tell the PTY the new size.
        // Debounced 200ms. DESKTOP ONLY: on Android, showing/hiding the URL bar
        // while scrolling fires window resize repeatedly — every resize makes
        // Ink TUIs redraw the full screen, old frames pile up in scrollback and
        // the output looks doubled/garbled. Mobile boots once at the exact
        // fitted size and never resizes.
        if (!isMobileRef.current) {
          let rzTimer = null
          const onWinResize = () => {
            clearTimeout(rzTimer)
            rzTimer = setTimeout(() => {
              for (const fr of [fit1Ref, fit2Ref, fit3Ref]) {
                const rec = fr.current
                if (!rec?.term || !rec?.fit) continue
                try { rec.fit.fit() } catch {}
                const inst = termInstances.current[
                  Object.keys(termInstances.current).find(k => termInstances.current[k]?.term === rec.term)
                ]
                if (inst?.ws && inst.ws.readyState === 1) {
                  try { inst.ws.send(JSON.stringify({ type: 'resize', cols: rec.term.cols, rows: rec.term.rows })) } catch {}
                }
                // WebGL ghosting fix: clean redraw after resize
                try { rec.term.clearTextureAtlas?.() } catch {}
                rec.term.refresh(0, rec.term.rows - 1)
              }
            }, 200)
          }
          window.addEventListener('resize', onWinResize)
          resizeHandlerRef.current = onWinResize
        }
      } else {
        console.log('[SplitPaneView] Refs not ready:', { term1: !!term1Ref.current, term2: !!term2Ref.current, term3: !!term3Ref.current })
        requestAnimationFrame(checkRefs)
      }
      }
      requestAnimationFrame(checkRefs)
    }, 350)

    return () => {
      // cleanup handled by individual returns
      clearTimeout(startDelay)
      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current)
        resizeHandlerRef.current = null
      }
    }
  }, [])

  // Simple inline resize handlers
  const [dragIndex, setDragIndex] = useState(null)
  const [dragStart, setDragStart] = useState(0)
  const [dragStartSizes, setDragStartSizes] = useState([])
  // On narrow screens (mobile) stack panes VERTICALLY — 3 columns of a 120-col
  // TUI are unreadable on a phone. Vertical rows give each TUI the full width.
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024)
  useEffect(() => {
    const onRz = () => { isMobileRef.current = window.innerWidth < 1024; setIsMobile(window.innerWidth < 1024) }
    window.addEventListener('resize', onRz)
    return () => window.removeEventListener('resize', onRz)
  }, [])

  const onMouseDown = (index, e) => {
    if (index >= 2) return
    setDragIndex(index)
    setDragStart(isMobile ? e.clientY : e.clientX)
    setDragStartSizes([...sizes])
    document.body.style.cursor = isMobile ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  const onMouseMove = (e) => {
    if (dragIndex === null) return
    const delta = (isMobile ? e.clientY - dragStart : e.clientX - dragStart)
    const denom = isMobile ? window.innerHeight : window.innerWidth
    const deltaPercent = (delta / denom) * 100
    const newSizes = [...dragStartSizes]
    newSizes[dragIndex] += deltaPercent
    newSizes[dragIndex + 1] -= deltaPercent
    if (newSizes[dragIndex] >= 20 && newSizes[dragIndex + 1] >= 20) {
      setSizes(newSizes)
    }
  }

  const onMouseUp = () => {
    setDragIndex(null)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  return (
    <div className="h-full flex flex-col" style={{ background: 'rgb(var(--cx-bg))' }}>
      <div className="px-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-4">
        <h3 className="font-semibold text-lg">Multi-Agent Split View</h3>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setSizes([40, 30, 30])} className="px-3 py-1 text-xs rounded border border-border hover:bg-bg-card">Reset Layout</button>
        </div>
      </div>
      <div
        className={`flex-1 overflow-hidden flex relative ${isMobile ? 'flex-col' : 'flex-row'}`}
        style={{ minHeight: 0 }}
      >
        {/* Pane 1: Main Agent (OpenCode) */}
        <div
          className="flex flex-col flex-shrink-0"
          style={isMobile
            ? { flex: `0 0 ${sizes[0]}%`, minHeight: '20%', width: '100%' }
            : { flex: `0 0 ${sizes[0]}%`, minWidth: '20%', height: '100%' }}
        >
          <div className="px-3 py-1.5 bg-bg-card border-b border-border flex items-center gap-2">
            <span className="text-xs font-medium text-accent">OpenCode</span>
            <span className="text-xs text-text-muted">Coordinator</span>
          </div>
          <div ref={term1Ref} className="flex-1 w-full overflow-hidden relative" style={{ minHeight: 0, height: '100%', background: getXtermBg() }} />
        </div>
        {/* Resize handle 1 */}
        <div
          className={`absolute z-10 transition-colors hover:bg-accent/30 ${isMobile ? 'h-1 left-0 right-0 cursor-row-resize' : 'w-1 top-12 bottom-0 cursor-col-resize'}`}
          style={isMobile ? { top: `calc(48px + ${sizes[0]}% * (100% - 48px) / 100)` } : { left: `${sizes[0]}%` }}
          onMouseDown={(e) => onMouseDown(0, e)}
          aria-label="Resize pane"
        />
        {/* Pane 2: Terminal + Files */}
        <div
          className="flex flex-col flex-shrink-0"
          style={isMobile
            ? { flex: `0 0 ${sizes[1]}%`, minHeight: '20%', width: '100%' }
            : { flex: `0 0 ${sizes[1]}%`, minWidth: '20%', height: '100%' }}
        >
          <div className="px-3 py-1.5 bg-bg-card border-b border-border flex items-center gap-2">
            <span className="text-xs font-medium text-green-500">Hermes</span>
            <span className="text-xs text-text-muted">Planner</span>
          </div>
          <div ref={term2Ref} className="flex-1 w-full overflow-hidden relative" style={{ minHeight: 0, height: '100%', background: getXtermBg() }} />
        </div>
        {/* Resize handle 2 */}
        <div
          className={`absolute z-10 transition-colors hover:bg-accent/30 ${isMobile ? 'h-1 left-0 right-0 cursor-row-resize' : 'w-1 top-12 bottom-0 cursor-col-resize'}`}
          style={isMobile ? { top: `calc(48px + (${sizes[0]}% + ${sizes[1]}%) * (100% - 48px) / 100)` } : { left: `${sizes[0] + sizes[1]}%` }}
          onMouseDown={(e) => onMouseDown(1, e)}
          aria-label="Resize pane"
        />
        {/* Pane 3: Browser Preview / Third Agent */}
        <div className="flex flex-col flex-1 min-w-0" style={isMobile ? { minHeight: '20%', width: '100%' } : { minWidth: '20%' }}>
          <div className="px-3 py-1.5 bg-bg-card border-b border-border flex items-center gap-2">
            <span className="text-xs font-medium text-purple-500">Claude Code</span>
            <span className="text-xs text-text-muted">Tasks</span>
          </div>
          <div ref={term3Ref} className="flex-1 w-full overflow-hidden relative" style={{ minHeight: 0, height: '100%', background: getXtermBg() }} />
        </div>
      </div>
    </div>
  )
}