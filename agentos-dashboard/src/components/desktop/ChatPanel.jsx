import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { TermKeypad } from './TermKeypad'
// Static import: dynamic import() created a separate chunk that failed to load
// on some networks -> xterm silently fell back to the DOM renderer (stripes on
// fractional-DPR screens). Bundled statically, the WebGL renderer always works.
import { WebglAddon } from '@xterm/addon-webgl'
import { 
  ENGINES, 
  WEB_ENGINES, 
  ENGINE_VIEW_KEY, 
  getEngineView, 
  setEngineView 
} from './ChatPanelEngines'
import { AGENT_STATES, AGENT_STATE_LABELS, AGENT_STATE_COLORS, AGENT_STATE_BG, detectAgentState } from '../../config/agentStates'
import { getAgentsByCategory, getAgentById } from '../../config/agents'

// The xterm theme follows the Life OS theme (light/dark). TUI apps like opencode
// v2 hot-reload their cli.json theme mode (see tui-ws), so both stay in sync.
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

function getProfileColor(id) {
  const colors = {
    'planner': '#10b981',
    'tasks': '#f59e0b',
    'knowledge': '#8b5cf6',
    'habits': '#ef4444',
    'finances': '#f97316',
    'health': '#ec4899',
    'learning': '#06b6d4',
    'contacts': '#eab308',
    'automations': '#6366f1',
    'calendar': '#8b5cf6',
    'projects': '#14b8a6',
    'default': '#6b7280',
  }
  return colors[id] || '#6b7280'
}

export function ChatPanel({ fullscreen = false }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)
  const wsRef = useRef(null)
  const showWebRef = useRef(false)
  const [agent, setAgent] = useState('default')
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

  // Fetch LifeOS profiles for Hermes profile selector
  const [lifeosProfiles, setLifeosProfiles] = useState([])
  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => {
        const profiles = (d.agents || [])
          .filter(a => a.category === 'lifeos')
          .map(a => ({ id: a.id, name: a.name, color: getProfileColor(a.id) }))
        // Add 'default' as first option
        setLifeosProfiles([{ id: 'default', name: 'Default', color: '#6b7280' }, ...profiles])
      })
      .catch(() => setLifeosProfiles([{ id: 'default', name: 'Default', color: '#6b7280' }]))
  }, [])

  // When an engine with a built-in web UI is picked: start it and switch to iframe.
  // src per engine is CACHED — switching engines back and forth shows the already
  // loaded SPA instantly (no reload, no API round-trip).
  // Web UI origins come from the BACKEND (the domain typed at install time). A baked-in
  // 'https://hermes.dktunnel.xyz' here pointed the iframe at a subdomain from an older
  // deployment, so the Web tab showed an empty frame while its own domain worked.
  const [webUrls, setWebUrls] = useState({})
  const [webSrcCache, setWebSrcCache] = useState(() => ({}))
  // Ручная перезагрузка фрейма: вход в дашборд движка можно завершить в отдельной вкладке
  // (портал Nous не позволяет фреймить себя), после чего cookie уже в общем jar браузера —
  // достаточно перезагрузить фрейм здесь.
  const [webReload, setWebReload] = useState(0)
  useEffect(() => {
    let alive = true
    fetch('/api/harnesses').then(r => r.json()).then(d => {
      if (!alive) return
      const urls = {}
      for (const h of d.harnesses || []) if (h.webUrl) urls[h.id] = h.webUrl
      setWebUrls(urls)
      // Hermes' dashboard is a plain virtual web UI — pre-fill its iframe. opencode
      // builds a session URL first, so it must NOT be pre-filled here.
      setWebSrcCache(prev => (prev.hermes || !urls.hermes) ? prev : { ...prev, hermes: urls.hermes })
    }).catch(() => {})
    return () => { alive = false }
  }, [])
  // Engines whose web UI needs no start call (Hermes' dashboard) get their src pre-filled by
  // the effect above, so the iframe mounts immediately. webState, however, only becomes
  // 'running' inside pickEngine — i.e. after the user taps the engine chip AGAIN. Until then
  // the frame is display:none and the Web view looks like an empty white area with no error,
  // while the page inside it has actually loaded (that is what the Web tab did on first open).
  useEffect(() => {
    if (!webSrcCache[engine]) return
    setWebState(s => (s === 'stopped' ? 'running' : s))
  }, [webSrcCache, engine])
  const pickEngine = async (id) => {
    setEngine(id)
    // Default view per user preference (Settings → Движки).
    setUseWeb(getEngineView(id, 'web') === 'web')
    // Cached web UI (or hermes virtual dashboard) -> show it immediately.
    if (webSrcCache[id]) {
      setWebState('running')
      return
    }
    // Hermes Agent dashboard: virtual web UI, no harness to start — just show the iframe
    // (its origin comes from /api/harnesses; without one there is nothing to embed).
    if (id === 'hermes') {
      setWebState(webSrcCache[id] || webUrls[id] ? 'running' : 'nodomain')
      return
    }
    // opencode web UI: its SPA follows prefers-color-scheme (system), NOT the
    // Life OS theme. localStorage on THIS origin can't reach the iframe's origin
    // (its own domain) — instead we set the CSS `color-scheme` property on the
    // iframe element itself, which propagates the preferred scheme into the
    // embedded document (see render below).
    if (id === 'opencode') {
      try {
        localStorage.removeItem('opencode-color-scheme')
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
        let ocSessionId = null
        if (id === 'opencode') {
          try {
            const sessionRes = await fetch('/ocapi/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}'
            })
            const sessionData = await sessionRes.json()
            if (sessionData?.data?.id) {
              ocSessionId = sessionData.data.id
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
        // Engines whose Web UI lives on its own domain: without a recorded domain there
        // is nothing to embed — say so instead of pointing the frame at the wrong host.
        if ((id === 'deepseek' && !deepseekWebBase) || (id === 'openclaw' && !openclawWebBase)
            || (id === 'opencode' && !opencodeWebBase)) {
          setWebState('nodomain')
          return
        }
        // Cache the iframe src for this engine so future switches are instant.
        const src = id === 'opencode'
          ? (ocSessionId
              ? `${opencodeWebBase}/server/${opencodeServerKey}/session/${ocSessionId}`
              : `${opencodeWebBase}/server/${opencodeServerKey}`)
          : id === 'deepseek'
            ? `${deepseekWebBase}/${d?.token ? `?token=${d.token}` : ''}`
            : id === 'openclaw'
              ? openclawWebBase
              : `/agent/${id}/${d?.token ? `?token=${d.token}` : ''}`
        setWebSrcCache(prev => ({ ...prev, [id]: src }))
        setWebState('running')
      } catch { setWebState('running') }
    }
  }

  const [keypadOn, setKeypadOn] = useState(true)
  // Web/TUI toggle for engines that support both. Initial value honors the user's
  // per-engine default from Settings («Движки · открывать по умолчанию»), so the
  // first Chat mount opens the preferred view, not a hardcoded Web.
  const [useWeb, setUseWeb] = useState(() => getEngineView(engine, 'web') === 'web')
  // Agent state machine (Herdr-style): unknown | idle | working | blocked | done
  const [agentState, setAgentState] = useState(AGENT_STATES.UNKNOWN)
  // Track the Life OS theme so embedded web UIs (opencode/deepseek SPAs follow
  // prefers-color-scheme) can be forced to match via the iframe's color-scheme.
  const [themeDark, setThemeDark] = useState(() => document.documentElement.getAttribute('data-theme') !== 'light')
  const themeDarkRef = useRef(themeDark)
  // On theme switch: xterm re-themes via applyTheme (mutation observer) and the
  // running TUI is told over WS so the backend syncs opencode's cli.json
  // (theme.mode hot-reloads inside the running TUI).
  useEffect(() => {
    themeDarkRef.current = themeDark
    try { wsRef.current?.send(JSON.stringify({ type: 'theme', theme: themeDark ? 'dark' : 'light' })) } catch {}
  }, [themeDark])
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setThemeDark(document.documentElement.getAttribute('data-theme') !== 'light')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  const hasWeb = webPorts[engine] !== undefined
  const showWeb = hasWeb && useWeb

  // OpenCode v2 web (>=2.0.14) routes: /server/:serverKey/session/:id, where
  // serverKey is base64 of the server URL. The origin is the domain entered at install
  // time (falls back to the historical default when the install recorded none).
  const opencodeWebBase = webUrls.opencode || ''
  const opencodeServerKey = (() => {
    try {
      const bin = new TextEncoder().encode(opencodeWebBase + '/')
      return btoa(String.fromCharCode(...bin)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    } catch { return '' }
  })()
  // dsh (DeepSeek) is the same style v2 SPA: its JS calls ROOT-absolute paths that must
  // reach its own backend, so it needs its own domain root too — taken from the API
  // (the domain recorded at install time), never a baked-in subdomain.
  const deepseekWebBase = webUrls.deepseek || ''
  // OpenClaw Control UI must load from its own domain root: the Gateway enforces a
  // browser-origin allowlist and serves SPA + WS over the gateway port, so it cannot be
  // prefixed under the Life OS domain.
  const openclawWebBase = webUrls.openclaw || ''

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
    showWebRef.current = showWeb
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
    // Unicode 11 width tables: opencode/hermes v2 TUIs draw emoji/box glyphs and
    // compute cell widths with string-width (emoji = 2 cols). Without this addon
    // xterm computes narrower widths -> menu rows shift and lose letters.
    try {
      import('@xterm/addon-unicode11').then(({ Unicode11Addon }) => {
        term.loadAddon(new Unicode11Addon())
        term.unicode.activeVersion = '11'
      }).catch(() => {})
    } catch {}
    term.open(el)
    // WebGL renderer: single texture, no subpixel seams between rows (the mobile
    // DPR "stripes"), and much faster than canvas/DOM. Needs the terminal fully
    // laid out — attach on the next frame after open().
    requestAnimationFrame(() => {
      try {
        const wgl = new WebglAddon()
        wgl.onContextLoss(() => { try { wgl.dispose() } catch {} })
        term.loadAddon(wgl)
      } catch (e) { try { window.__wglErr = String(e?.message || e) } catch {} }
    })
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
    // Fill the container VERTICALLY: cols stay fixed at 120 (Ink box-drawing breaks
    // otherwise) but rows follow the real container height, so the TUI stretches
    // to the full screen instead of floating in a 40-row strip.
    const rowsFor = () => {
      try {
        const d = fit.proposeDimensions()
        if (d?.rows && Number.isFinite(d.rows)) return Math.max(20, Math.round(d.rows))
      } catch {}
      return 40
    }
    const doResize = () => {
      const cols = 120
      const rows = rowsFor()
      try { term.resize(cols, rows) } catch {}
      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    }
    // apply the taller rows immediately after layout, before first paint of data
    try { term.resize(120, rowsFor()) } catch {}
    // NOTE: no post-spawn resize loop — the PTY boots at the exact rows (via URL
    // params) and re-resizing an Ink TUI after spawn makes it redraw skewed.
    // Only a real window resize triggers a new resize message.
    setTimeout(doResize, 50)
    fitRef.current = fit
    termRef.current = term

    // Only connect TUI WebSocket when NOT in Web UI mode
    const connect = () => {
      if (showWeb) {
        setConn('web')
        return
      }
      setConn('connecting')
      // WSS via same origin (Caddy proxies /ws/* to backend)
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${location.host}/ws/tui?engine=${engine}&profile=${agent}&cols=120&rows=${term.rows}&theme=${themeDarkRef.current ? 'dark' : 'light'}`)
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
          if (msg.type === 'data') {
            term.write(msg.data)
            // Detect agent state from terminal output (Herdr-style)
            if (msg.data && typeof msg.data === 'string') {
              setAgentState(prev => detectAgentState(msg.data, prev))
            }
          }
          else if (msg.type === 'exit') { setConn('exited'); term.writeln(`\r\n\x1b[31m[TUI exited code ${msg.code}]\x1b[0m`) }
        } catch { term.write(String(ev.data)) }
      }
      ws.onclose = () => {
        if (!showWebRef.current) setConn('disconnected')
      }
      ws.onerror = () => {
        if (!showWebRef.current) setConn('error')
      }
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
      // null the refs BEFORE disposing so a late window-resize can't call
      // fit() on a disposed terminal (throws "reading 'dimensions'")
      termRef.current = null
      fitRef.current = null
      try { wsRef.current?.close() } catch {}
      try { term.dispose() } catch {}
    }
  }, [agent, engine, webPorts, fullscreen, showWeb])  // reconnect when profile, engine or view (web/tui) changes

  return (
    <div className="flex flex-col h-full w-full rounded-xl overflow-hidden border" style={{ minHeight: '320px', background: themeDark ? '#0b0e14' : '#ffffff', borderColor: themeDark ? '#0b0e14' : 'rgb(var(--term-border))' }}>
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
        {/* Web-режим: вход и внешнее открытие. Дашборд движка со своей аутентификацией
            (Hermes) требует логина, а вход через Nous Portal невозможен внутри фрейма —
            портал запрещает фрейминг. Поэтому логин-пароль вводится прямо здесь, а OAuth
            открывается в новой вкладке; после входа cookie уже в общем jar браузера
            (домены движка и панели — один сайт), и «Обновить» показывает дашборд. */}
        {showWeb && (webSrcCache[engine] || webUrls[engine]) && (
          <>
            <button onClick={() => setWebReload(n => n + 1)}
              className="ml-1 px-2 py-1 rounded text-xs shrink-0 border border-border bg-bg-card text-text-muted hover:text-text transition-colors"
              title="Перезагрузить встроенный интерфейс (например, после входа в отдельной вкладке)">↻</button>
            <button onClick={() => window.open(webUrls[engine] || webSrcCache[engine], '_blank', 'noopener')}
              className="px-2 py-1 rounded text-xs shrink-0 border border-border bg-bg-card text-text-muted hover:text-text transition-colors"
              title="Открыть web-интерфейс движка в новой вкладке">↗</button>
            {engine === 'hermes' && webUrls.hermes && (
              <button onClick={() => window.open(`${webUrls.hermes}/auth/login?provider=nous`, '_blank', 'noopener')}
                className="px-2 py-1 rounded text-xs shrink-0 border border-border bg-bg-card text-text-muted hover:text-text transition-colors whitespace-nowrap"
                title="Вход через Nous Portal: откроется в новой вкладке (внутри фрейма портал себя фреймить не даёт), после входа вернись сюда и нажми ↻">🔑 Nous</button>
            )}
          </>
        )}
        {/* Connection + Agent state indicator */}
        {(() => {
          // In Web mode: show "web"
          if (showWeb) return (
            <span className="ml-auto flex items-center gap-1.5 text-xs whitespace-nowrap text-accent">
              <span className="w-2 h-2 rounded-full bg-accent" />
              web
            </span>
          )
          // In TUI mode: show agent state (Herdr-style 5 states)
          const label = AGENT_STATE_LABELS[agentState] || agentState
          const color = AGENT_STATE_COLORS[agentState] || 'text-text-muted'
          const bgColor = AGENT_STATE_BG[agentState] || 'bg-text-muted'
          return (
            <span className={`ml-auto flex items-center gap-1.5 text-xs whitespace-nowrap ${color}`}>
              <span className={`w-2 h-2 rounded-full ${bgColor}`} />
              {conn === 'connected' ? label : conn}
            </span>
          )
        })()}
      </div>
      {/* Profile row (only for the hermes engine) */}
      {engine === 'hermes' && !showWeb && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-elevated/70 border-b border-border overflow-x-auto">
          <span className="text-xs text-text-muted whitespace-nowrap">профиль:</span>
          {lifeosProfiles.map(a => (
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
      {showWeb && webState === 'nodomain' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-sm text-text-muted" style={{ minHeight: '280px' }}>
          <span>Web UI не настроен: при установке движка не был указан домен.</span>
          <span className="text-xs">Переустанови движок и впиши домен — адрес подхватится автоматически.</span>
        </div>
      )}
      {showWeb && webState === 'starting' && !webSrcCache[engine] && (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm" style={{ minHeight: '280px' }}>
          ⏳ Запускаю {engine} web-интерфейс...
        </div>
      )}
      {/* All started web UIs stay mounted (hidden with display:none) — switching
          engines shows the already loaded SPA instantly instead of reloading it.
          The key includes the theme: SPAs like opencode read prefers-color-scheme
          ONCE at boot and never react to live changes, so a theme switch must
          remount the iframe (color-scheme style is set before it boots). */}
      {Object.entries(webSrcCache).map(([id, src]) => (
        <iframe
          key={`${id}-${themeDark ? 'dark' : 'light'}-${webReload}`}
          src={src}
          className="flex-1 w-full border-0"
          style={{
            minHeight: '420px', width: '100%', height: '100%',
            display: (engine === id && showWeb && webState === 'running') ? 'block' : 'none',
            background: '#fff',
            // propagate the Life OS theme into the embedded SPA's prefers-color-scheme
            colorScheme: themeDark ? 'dark' : 'light',
          }}
          sandbox={id === 'openclaw' ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals' : undefined}
          allow="clipboard-read; clipboard-write; microphone; camera"
          referrerPolicy="origin-when-cross-origin"
          title={`${id} web`}
        />
      ))}
      {!showWeb && (
        <>
          <div ref={containerRef} className="flex-1 w-full overflow-hidden" style={{ minHeight: '280px', minWidth: '900px' }} />
          {/* on-screen keypad only for touch/narrow screens — laptops have a real keyboard */}
          {keypadOn && (
            <div className="lg:hidden">
              <TermKeypad onSend={sendExternal} />
            </div>
          )}
        </>
      )}
    </div>
  )
}