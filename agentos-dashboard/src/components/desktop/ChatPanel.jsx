import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { TermKeypad } from './TermKeypad'

// Read the active theme from the CSS custom-property palette so the xterm TUI
// follows the chosen light/dark theme (background + foreground + ANSI palette).
function getXtermTheme() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light'
  const ANSI = dark
    ? ['#0b0e14','#f85149','#3fb950','#e3b341','#4d9be6','#b362f9','#56b4c2','#c9d1d9','#7d8590','#ff5f56','#3fb950','#e3b341','#4d9be6','#b362f9','#56b4c2','#f0f6fc']
    : ['#ffffff','#dc2626','#24a148','#eab308','#3b82f6','#a855f7','#0fbfbf','#9ca3af','#6b7280','#ef4444','#24a148','#eab308','#3b82f6','#a855f7','#0fbfbf','#111827']
  return {
    background: dark ? '#0b0e14' : '#ffffff',
    foreground: dark ? '#e6edf3' : '#181c28',
    cursor: '#2f81f7',
    cursorAccent: dark ? '#0b0e14' : '#ffffff',
    selectionBackground: 'rgba(88,101,242,0.35)',
    black: ANSI[0], red: ANSI[1], brightBlack: ANSI[8],
    green: ANSI[2], brightRed: ANSI[9], yellow: ANSI[3], brightGreen: ANSI[10],
    blue: ANSI[4], brightYellow: ANSI[11], magenta: ANSI[5], brightBlue: ANSI[12],
    cyan: ANSI[6], brightMagenta: ANSI[13], white: ANSI[7], brightCyan: ANSI[14],
    brightWhite: ANSI[15],
  }
}

const AGENTS = [
  { id: 'coordinator', name: 'Coordinator', color: '#5865f2' },
  { id: 'planner', name: 'Planner', color: '#10b981' },
  { id: 'tasks', name: 'Tasks', color: '#f59e0b' },
  { id: 'knowledge', name: 'Knowledge', color: '#8b5cf6' },
  { id: 'habits', name: 'Habits', color: '#ef4444' },
]

// External engines (their CLI spawned directly when installed). engine differs from profile.
// Exported so SettingsPanel can offer a default-view (Web/TUI) choice per engine.
export const ENGINES = [
  { id: 'hermes', name: 'Hermes' },
  { id: 'opencode', name: 'OpenCode' },
  { id: 'codex', name: 'Codex' },
  { id: 'claude', name: 'Claude' },
  { id: 'pi', name: 'Pi' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'openclaw', name: 'OpenClaw' },
]

// Engines that expose a built-in web UI (the rest are TUI-only).
export const WEB_ENGINES = new Set(['hermes', 'opencode', 'deepseek', 'openclaw'])

const ENGINE_VIEW_KEY = 'lifeos.engine.view'  // { [engineId]: 'web'|'tui' }

export function getEngineView(engineId, fallback = 'web') {
  try {
    const m = JSON.parse(localStorage.getItem(ENGINE_VIEW_KEY) || '{}')
    if (m[engineId]) return m[engineId]
  } catch {}
  return fallback
}

export function setEngineView(engineId, view) {
  try {
    const m = JSON.parse(localStorage.getItem(ENGINE_VIEW_KEY) || '{}')
    m[engineId] = view
    localStorage.setItem(ENGINE_VIEW_KEY, JSON.stringify(m))
  } catch {}
}

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
  const [installedEngines, setInstalledEngines] = useState(null)  // null = пока не знаем

  useEffect(() => {
    fetch('/api/harnesses').then(r => r.json()).then(d => {
      const m = {}
      const inst = {}
      for (const h of (d.harnesses || [])) {
        if (h?.web?.port) m[h.id] = h.web.port
        inst[h.id] = !!h.installed
      }
      // Hermes Agent web dashboard is not a harness — treat it as a web UI so the
      // engine selector shows the 🌐 Web / 💻 TUI toggle and opens the dashboard.
      m.hermes = 9119
      setWebPorts(m)
      setInstalledEngines(inst)
    }).catch(() => { setInstalledEngines({}) })
  }, [])

  // When an engine with a built-in web UI is picked: start it and switch to iframe.
  const pickEngine = async (id) => {
    setEngine(id)
    // Default view per user preference (Settings → Движки).
    setUseWeb(getEngineView(id, 'web') === 'web')
    setWebToken(null)
    setWebSessionId(null)
    // Hermes Agent dashboard: virtual web UI, no harness to start — just show the iframe.
    if (id === 'hermes') {
      setWebState('running')
      return
    }
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
  // Web/TUI toggle for engines that support both. Initial value honors the user's
  // per-engine default from Settings («Движки · открывать по умолчанию»), so the
  // first Chat mount opens the preferred view, not a hardcoded Web.
  const [useWeb, setUseWeb] = useState(() => getEngineView('hermes', 'web') === 'web')
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
  // Hermes Agent web dashboard — its OAuth + Basic auth live in the app (on its own
  // subdomain), so it loads straight from the subdomain like openclaw. External access
  // stays OAuth+Basic protected for Remote Gateway/Desktop; the iframe uses the same origin.
  const hermesWebBase = 'https://hermes.dktunnel.xyz'

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
    const activeTheme = getXtermTheme()
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 11,
      lineHeight: 1,
      fontFamily: 'monospace',
      theme: activeTheme,
      scrollback: 2000,
      cols: 120,
      rows: 40,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    // Hairline stripes fix: with lineHeight > 1 the canvas paints gaps between rows
    // (visible on mobile DPR) — paint the container with the SAME theme background
    // so gaps blend into the terminal instead of showing the page background.
    el.style.background = activeTheme.background
    // live theme switch (light/dark) -> re-theme the xterm without reconnecting
    const applyTheme = () => {
      try {
        const th = getXtermTheme()
        term.options.theme = th
        el.style.background = th.background
        term.refresh()
      } catch (e) { /* ignore */ }
    }
    const themeObserver = new MutationObserver((muts) => {
      if (muts.some(m => m.attributeName === 'data-theme')) applyTheme()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
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
      try { themeObserver.disconnect() } catch {}
      onData.dispose()
      window.removeEventListener('resize', onResize)
      try { wsRef.current?.close() } catch {}
      try { term.dispose() } catch {}
    }
  }, [agent, engine, webPorts, fullscreen, showWeb])  // reconnect when profile, engine or view (web/tui) changes

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border" style={{ minHeight: '320px', background:'rgb(var(--term-bg))', borderColor:'rgb(var(--term-border))' }}>
      {/* Engine selector */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-elevated border-b border-border overflow-x-auto">
        <span className="text-xs text-text-muted whitespace-nowrap">Движок:</span>
        {ENGINES.filter(e => !installedEngines || installedEngines[e.id]).map(e => (
          <button
            key={e.id}
            onClick={() => pickEngine(e.id)}
            className={`px-2 py-0.5 rounded text-xs whitespace-nowrap transition-colors ${engine===e.id ? 'text-white bg-accent' : 'text-text-muted hover:text-text hover:bg-bg-card'}`}
            title={webPorts[e.id] ? `Открыть web-интерфейс ${e.name}` : `Терминал ${e.name}`}
          >
            {e.name}
          </button>
        ))}
        {/* Web/TUI toggle for engines that support both; disabled (hint) for TUI-only */}
        {hasWeb ? (
          <button
            onClick={() => setUseWeb(!useWeb)}
            className={`ml-2 px-2 py-0.5 rounded text-xs whitespace-nowrap transition-colors border ${useWeb ? 'bg-accent text-white border-accent' : 'bg-bg-card border-border text-text-muted hover:text-text'}`}
            title={useWeb ? 'Переключить на TUI' : 'Переключить на Web'}
          >
            {useWeb ? '🌐 Web' : '💻 TUI'}
          </button>
        ) : (
          <button
            disabled
            className="ml-2 px-2 py-0.5 rounded text-xs whitespace-nowrap border border-border bg-bg-card text-text-muted opacity-60 cursor-not-allowed"
            title="У этого движка нет web-интерфейса — доступен только TUI. Установи через «Установка компонентов», если он должен появиться."
          >
            💻 TUI
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
          className={`ml-1 px-2 py-1 rounded text-xs shrink-0 border transition-colors ${keypadOn ? 'bg-accent text-white border-accent' : 'bg-bg-card border-border text-text-muted hover:text-text'}`}
          title="Показать/скрыть клавиатуру">⌨</button>
        <span className={`ml-auto flex items-center gap-1.5 text-xs whitespace-nowrap ${conn==='connected' ? 'text-success' : conn==='connecting' ? 'text-warning' : 'text-danger'}`}>
          <span className={`w-2 h-2 rounded-full ${conn==='connected'?'bg-success':conn==='connecting'?'bg-warning':'bg-danger'}`} />
          {conn}
        </span>
      </div>
      {/* Profile row (only for the hermes engine) */}
      {engine === 'hermes' && !showWeb && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-elevated/70 border-b border-border overflow-x-auto">
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
        ) : engine === 'hermes' ? (
          <iframe
            src={hermesWebBase}
            className="flex-1 w-full border-0"
            style={{ minHeight: '420px', background: '#fff' }}
            allow="clipboard-read; clipboard-write; microphone; camera"
            referrerPolicy="origin-when-cross-origin"
            title="Hermes Dashboard"
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