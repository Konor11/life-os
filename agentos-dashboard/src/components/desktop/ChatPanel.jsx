import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { TermKeypad } from './TermKeypad'

const AGENTS = [
  { id: 'coordinator', name: 'Coordinator', color: '#5865f2' },
  { id: 'planner', name: 'Planner', color: '#10b981' },
  { id: 'tasks', name: 'Tasks', color: '#f59e0b' },
  { id: 'knowledge', name: 'Knowledge', color: '#8b5cf6' },
  { id: 'habits', name: 'Habits', color: '#ef4444' },
]

// External engines (their CLI spawned directly when installed). engine differs from profile.
const ENGINES = [
  { id: 'hermes', name: 'Hermes agent' },
  { id: 'opencode', name: 'OpenCode' },
  { id: 'codex', name: 'Codex' },
  { id: 'claude', name: 'Claude' },
  { id: 'pi', name: 'Pi' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'openclaw', name: 'OpenClaw' },
]

export function ChatPanel({ fullscreen = false }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)
  const wsRef = useRef(null)
  const [agent, setAgent] = useState('coordinator')
  const [engine, setEngine] = useState('hermes')
  const [conn, setConn] = useState('disconnected')
  const [fontSize, setFontSize] = useState(11)
  const [webPorts, setWebPorts] = useState({})  // engineId -> port (harness web UIs)
  const [webState, setWebState] = useState('stopped')  // stopped|starting|running
  const [webToken, setWebToken] = useState(null)
  const [webSessionId, setWebSessionId] = useState(null)

  useEffect(() => {
    fetch('/api/harnesses').then(r => r.json()).then(d => {
      const m = {}
      for (const h of (d.harnesses || [])) if (h?.web?.port) m[h.id] = h.web.port
      setWebPorts(m)
    }).catch(() => {})
  }, [])

  // When an engine with a built-in web UI is picked: start it and switch to iframe.
  const pickEngine = async (id) => {
    setEngine(id)
    setWebToken(null)
    setWebSessionId(null)
    // opencode web UI: force dark theme + pre-seed its localStorage (same origin as the iframe)
    // so the v2 SPA opens /root directly instead of showing the native "Select Workspace
    // Directory" dialog (which `opencode serve` cannot serve -> client error 403).
    if (id === 'opencode') {
      try {
        localStorage.setItem('opencode-color-scheme', 'dark')
        // opencode scoped storage keys: "<storage>:<scoped-key>". "layout.page" holds
        // lastProjectSession + activeProject; passing a valid session id makes the SPA
        // restore /root instead of the first-run directory picker.
        localStorage.setItem('opencode.global.dat:layout.page', JSON.stringify({
          lastProjectSession: { '/root': { directory: '/root', id: null, at: Date.now() } },
          activeProject: '/root',
          activeWorkspace: undefined,
          workspaceOrder: {},
          workspaceName: {},
          workspaceBranchName: {},
          workspaceExpanded: {},
          gettingStartedDismissed: true
        }))
      } catch {}
    }
    const port = webPorts[id]
    if (port) {
      setWebState('starting')
      try {
        const r = await fetch('/api/harness/web/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
        const d = await r.json()
        // deepseek (dsh): the JS calls ROOT-absolute paths so it lives on its own
        // subdomain. To get the auth cookie on that domain we let the IFRAME itself
        // load "ds..?token=" (same-site -> Set-Cookie persisted on ds), which 303-
        // redirects to "/" authenticated. A separate cross-origin fetch would not
        // persist the SameSite=Strict cookie, so we do NOT null the token here.
        if ((id === 'deepseek') && d?.token) {
          setWebToken(d.token)
        } else if (d?.token) {
          setWebToken(d.token)
        }
        // Auto-create session for opencode
        if (id === 'opencode') {
          try {
            const sessionRes = await fetch('/ocapi/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}'
            })
            const sessionData = await sessionRes.json()
            if (sessionData?.data?.id) {
              setWebSessionId(sessionData.data.id)
              // update seed with the REAL session id so the v2 SPA restores /root directly
              try {
                localStorage.setItem('opencode.global.dat:layout.page', JSON.stringify({
                  lastProjectSession: { '/root': { directory: '/root', id: sessionData.data.id, at: Date.now() } },
                  activeProject: '/root',
                  activeWorkspace: undefined,
                  workspaceOrder: {},
                  workspaceName: {},
                  workspaceBranchName: {},
                  workspaceExpanded: {},
                  gettingStartedDismissed: true
                }))
              } catch {}
            }
          } catch (e) { console.log('OC-SESSION-ERR', String(e && e?.toString ? e.toString() : e)) }
        }
        setWebState('running')
      } catch { setWebState('running') }
    }
  }

  const [keypadOn, setKeypadOn] = useState(true)
  const [useWeb, setUseWeb] = useState(true)  // Web/TUI toggle for engines that support both
  const hasWeb = webPorts[engine] !== undefined
  const showWeb = hasWeb && useWeb

  // opencode v2 SPA routes sessions as /<base64url(directory)>/session/<id> — the same
  // cn() encoding the bundle uses (UTF-8 -> base64 -> url-safe, no padding). Directory=/root.
  const opencodeB64Dir = (() => {
    try {
      const utf8 = new TextEncoder().encode('/root')
      const bin = String.fromCharCode(...utf8)
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    } catch { return 'L3Jvb3Q' }
  })()

  // OpenCode v2 SPA REQUIRES the session on the HOST ROOT path (it routes on
  // pathname.split("/"); any path prefix makes it fall to {type:"home"} = empty screen).
  // Serve it on its own subdomain oc.dktunnel.xyz at "/<base64dir>/session/<id>".
  const opencodeWebBase = 'https://oc.dktunnel.xyz'
  // dsh (DeepSeek) is the same style v2 SPA: its JS calls ROOT-absolute paths that
  // must reach its own backend, so it needs its own private subdomain root too.
  const deepseekWebBase = 'https://ds.dktunnel.xyz'
  // OpenClaw Control UI must load from its own subdomain root: the Gateway enforces
  // browser-origin allowlist (gateway.controlUi.allowedOrigins) and serves SPA + WS
  // over the gateway port, so it cannot be prefixed under os.dktunnel.xyz.
  const openclawWebBase = 'https://openclaw.dktunnel.xyz'

  // Build iframe src. Keep trailing slash so Caddy's /agent/<engine>/* matcher fires,
  // then query string. opencode has no token -> ?session first; deepseek uses cookie.
  const webSrc = `/agent/${engine}/` +
    (webToken ? `?token=${webToken}` : '') +
    (webSessionId ? (webToken ? `&session=${webSessionId}` : `?session=${webSessionId}`) : '')

  const changeFont = (delta) => {
    setFontSize(prev => {
      const nf = Math.min(24, Math.max(7, prev + delta))
      const t = termRef.current
      if (t) { t.options.fontSize = nf; try { fitRef.current?.fit() } catch {} }
      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols: t?.cols, rows: t?.rows }))
      }
      return nf
    })
  }

  const sendExternal = (data) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'input', data }))
    }
  }

  // Connect WS + attach xterm (skip for engines with a built-in web UI)
  useEffect(() => {
    if (showWeb) {
      setConn('web')
      return () => {}
    }
    const el = containerRef.current
    if (!el) return

    // init terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 11,
      lineHeight: 1.25,
      fontFamily: 'monospace',
      theme: { background: '#000', foreground: '#e7e9ee' },
      scrollback: 2000,
      cols: 120,
      rows: 40,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    // IMPORTANT: do NOT shrink cols to the narrow mobile viewport — that breaks the TUI.
    // Keep 120 cols fixed so Ink renders box-drawing cleanly; the container scrolls sideways.
    const doResize = () => {
      const cols = 120
      const rows = term.rows || 40
      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    }
    setTimeout(doResize, 50)
    fitRef.current = fit
    termRef.current = term

    const connect = () => {
      setConn('connecting')
      // WSS via same origin (Caddy proxies /ws/* to backend)
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${location.host}/ws/tui?engine=${engine}&profile=${agent}`)
      wsRef.current = ws

      ws.onopen = () => {
        setConn('connected')
        // clear terminal on (re)connect
        term.reset()
        term.writeln('\x1b[2J\x1b[H')
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'data') term.write(msg.data)
          else if (msg.type === 'exit') { setConn('exited'); term.writeln(`\r\n\x1b[31m[TUI exited code ${msg.code}]\x1b[0m`) }
        } catch { term.write(String(ev.data)) }
      }
      ws.onclose = () => { setConn('disconnected') }
      ws.onerror = () => { setConn('error') }
    }

    connect()

    // input -> WS
    const onData = term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }))
      }
    })
    const onResize = () => {
      if (termRef.current && fitRef.current) {
        try { fitRef.current.fit() } catch {}
        if (wsRef.current && wsRef.current.readyState === 1) {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      }
    }
    window.addEventListener('resize', onResize)

    return () => {
      onData.dispose()
      window.removeEventListener('resize', onResize)
      try { wsRef.current?.close() } catch {}
      try { term.dispose() } catch {}
    }
  }, [agent, engine, webPorts, fullscreen])  // reconnect when profile or engine changes

  return (
    <div className="flex flex-col h-full bg-black rounded-xl overflow-hidden border border-border" style={{ minHeight: '320px' }}>
      {/* Engine selector */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-elevated border-b border-border overflow-x-auto">
        <span className="text-xs text-text-muted whitespace-nowrap">Движок:</span>
        {ENGINES.map(e => (
          <button
            key={e.id}
            onClick={() => pickEngine(e.id)}
            className={`px-2 py-0.5 rounded text-xs whitespace-nowrap transition-colors ${engine===e.id ? 'text-white bg-accent' : 'text-text-muted hover:text-text'}`}
            title={webPorts[e.id] ? `Открыть web-интерфейс ${e.name}` : `Терминал ${e.name}`}
          >
            {e.name}
          </button>
        ))}
        {/* Web/TUI toggle for engines that support both */}
        {hasWeb && (
          <button
            onClick={() => setUseWeb(!useWeb)}
            className={`ml-2 px-2 py-0.5 rounded text-xs whitespace-nowrap transition-colors border ${useWeb ? 'bg-accent text-white border-accent' : 'bg-black/60 border-border text-text-muted hover:text-text'}`}
            title={useWeb ? 'Переключить на TUI' : 'Переключить на Web'}
          >
            {useWeb ? '🌐 Web' : '💻 TUI'}
          </button>
        )}
        {/* Font size controls */}
        <div className="flex items-center gap-0.5 border border-border rounded-lg overflow-hidden ml-1 shrink-0">
          <button onClick={() => changeFont(-1)} className="px-2 py-0.5 text-sm font-bold text-text-muted hover:text-text hover:bg-bg-card transition-colors" title="Уменьшить шрифт">−</button>
          <span className="text-xs text-text-muted px-1 border-x border-border select-none">{fontSize}</span>
          <button onClick={() => changeFont(1)} className="px-2 py-0.5 text-sm font-bold text-text-muted hover:text-text hover:bg-bg-card transition-colors" title="Увеличить шрифт">+</button>
        </div>
        {/* Keypad toggle */}
        <button onClick={() => setKeypadOn(!keypadOn)}
          className={`ml-1 px-2 py-1 rounded text-xs shrink-0 border transition-colors ${keypadOn ? 'bg-accent text-white border-accent' : 'bg-black/60 border-border text-text-muted hover:text-text'}`}
          title="Показать/скрыть клавиатуру">⌨</button>
        <span className={`ml-auto flex items-center gap-1.5 text-xs whitespace-nowrap ${conn==='connected' ? 'text-success' : conn==='connecting' ? 'text-warning' : 'text-danger'}`}>
          <span className={`w-2 h-2 rounded-full ${conn==='connected'?'bg-success':conn==='connecting'?'bg-warning':'bg-danger'}`} />
          {conn}
        </span>
      </div>
      {/* Profile row (only for the hermes engine) */}
      {engine === 'hermes' && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black border-b border-border overflow-x-auto">
          <span className="text-xs text-text-muted whitespace-nowrap">профиль:</span>
          {AGENTS.map(a => (
            <button
              key={a.id}
              onClick={() => setAgent(a.id)}
              className={`px-2 py-0.5 rounded text-xs whitespace-nowrap transition-colors ${agent===a.id ? 'text-white' : 'text-text-muted hover:text-text'}`}
              style={agent===a.id ? { background: a.color } : {}}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}
      {showWeb ? (
        webState === 'starting' ? (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm" style={{ minHeight: '280px' }}>
            ⏳ Запускаю {engine} web-интерфейс...
          </div>
        ) : engine === 'openclaw' ? (
          <iframe
            src={openclawWebBase}
            className="flex-1 w-full border-0"
            style={{ minHeight: '420px', background: '#fff' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            allow="clipboard-read; clipboard-write"
            title="OpenClaw Control"
          />
        ) : (
          <iframe
                      src={engine === 'opencode' && webSessionId
                        ? `${opencodeWebBase}/${opencodeB64Dir}/session/${webSessionId}`
                        : engine === 'deepseek'
                          ? `${deepseekWebBase}/${webToken ? `?token=${webToken}` : ''}`
                          : `/agent/${engine}/${webToken ? `?token=${webToken}` : ''}${webSessionId ? `&session=${webSessionId}` : ''}`}
                      className="flex-1 w-full border-0"
                      style={{ minHeight: '520px', width: '100%', height: '100%' }}
                      title={`${engine} web`}
            allow="clipboard-read; clipboard-write; microphone; camera"
          />
        )
      ) : (
        <>
          <div ref={containerRef} className="flex-1 overflow-auto p-0" style={{ minHeight: '280px', overflowX: 'auto', overflowY: 'auto', minWidth: '900px' }} />
          {keypadOn && <TermKeypad onSend={sendExternal} />}
        </>
      )}
    </div>
  )
}