import { useCallback, useEffect, useRef, useState } from 'react'
import { createTuiEngine } from './tui-engine'
import { TermKeypad } from './TermKeypad'
import { 
  ENGINES, 
  WEB_ENGINES, 
  ENGINE_VIEW_KEY, 
  getEngineView, 
  setEngineView 
} from './ChatPanelEngines'
import { AGENT_STATES, AGENT_STATE_LABELS, AGENT_STATE_COLORS, AGENT_STATE_BG, detectAgentState } from '../../config/agentStates'
import { getAgentsByCategory, getAgentById } from '../../config/agents'

// Лента сообщений из истории движка (адаптер: agentos-backend/transcript.py, пока умеет Hermes).
// Это не парсинг экрана TUI: обычный список DOM — значит работает родная прокрутка страницы, нет
// ни alt-screen, ни потерянного скроллбека, ни обрывков кадров. Приём взят у AgentDeck, где
// транспорт терминала агент-агностик, а читаемость даёт адаптер, знающий формат истории движка.
function TranscriptView({ agent, themeDark }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [auto, setAuto] = useState(true)
  const boxRef = useRef(null)
  const nearBottomRef = useRef(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat/transcript?profile=${encodeURIComponent(agent || 'default')}&limit=200`)
      const j = await r.json()
      if (j && j.ok) { setData(j); setErr('') } else { setErr((j && j.error) || 'история недоступна') }
    } catch (e) { setErr(String(e?.message || e)) }
  }, [agent])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!auto) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [auto, load])

  // Держим прокрутку у конца только если пользователь сам не уехал вверх — иначе чтение истории
  // прыгало бы на каждой подгрузке.
  useEffect(() => {
    const el = boxRef.current
    if (!el || !nearBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [data])

  const msgs = (data && data.messages) || []
  const btn = 'px-2 py-0.5 rounded border border-border bg-bg-card text-text-muted hover:text-text transition-colors'
  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ minHeight: '280px' }}>
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted border-b border-border">
        <span className="truncate">
          Лента: история движка{data && data.session ? ` · ${data.session}` : ''}
        </span>
        <button onClick={load} className={btn} title="Прочитать историю заново">обновить</button>
        <button onClick={() => setAuto(v => !v)} className={btn} title="Автообновление раз в 3 секунды">
          {auto ? '⟳ авто' : '⟳ пауза'}
        </button>
        {err && <span className="text-red-400 truncate">{err}</span>}
      </div>
      <div
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="flex-1 overflow-y-auto p-3 space-y-3"
        style={{ background: themeDark ? '#0b0e14' : '#ffffff' }}
      >
        {msgs.length === 0 && (
          <div className="text-sm text-text-muted">
            История пуста. Напиши движку в терминале — сообщения появятся здесь.
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className="rounded-lg border border-border px-3 py-2"
            style={{ background: themeDark ? '#111827' : '#f8fafc' }}>
            <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
              {m.role === 'user' ? 'вы' : (m.tool ? `инструмент: ${m.tool}` : 'агент')}
            </div>
            <div className="text-sm whitespace-pre-wrap break-words">{m.text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Размер шрифта терминала: на телефоне 120-колоночный TUI в экран не влезает, поэтому
// мелкий шрифт нужен (7 было мало — просили меньше), и он должен переживать перезагрузку
// страницы, а не сбрасываться на 11.
const KEYPAD_KEY = 'lifeos.chat.keypad'
// Экранная клавиатура: выбор запоминается — если её убрали, после перезагрузки она не
// должна возвращаться.
function storedKeypad() {
  try { const v = localStorage.getItem(KEYPAD_KEY); return v === null ? true : v === '1' } catch { return true }
}
const FONT_KEY = 'lifeos.chat.fontSize'
const FONT_MIN = 4
const FONT_MAX = 24
function storedFontSize() {
  try {
    const v = parseInt(localStorage.getItem(FONT_KEY), 10)
    if (Number.isFinite(v)) return Math.min(FONT_MAX, Math.max(FONT_MIN, v))
  } catch {}
  return 11
}

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
  const doResizeRef = useRef(null)   // resize-путь из эффекта терминала (для смены кегля)
  const [agent, setAgent] = useState('default')
  const [engine, setEngine] = useState('hermes')
  const [conn, setConn] = useState('disconnected')
  const [fontSize, setFontSize] = useState(storedFontSize)
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

  // Профили Hermes для селектора в чате. Список приходит с бэкенда из РЕАЛЬНЫХ каталогов
  // профилей (~/.hermes/profiles/<name>) — раньше он брался из статичного конфига агентов,
  // поэтому показывал несуществующие профили и не видел только что созданный.
  const [lifeosProfiles, setLifeosProfiles] = useState([{ id: 'default', name: 'Default', color: '#6b7280' }])
  const loadProfiles = useCallback(() => {
    fetch('/api/profiles')
      .then(r => r.json())
      .then(d => {
        const list = (d.profiles || []).map(pr => ({ id: pr.id, name: pr.name, color: getProfileColor(pr.id) }))
        if (!list.length) return
        setLifeosProfiles(list)
        // профиль могли удалить, пока он был выбран — не висим на несуществующем
        setAgent(prev => (list.some(x => x.id === prev) ? prev : 'default'))
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    loadProfiles()
    // вернулся к вкладке (мобильный Chrome выгружает её) или создал профиль в терминале —
    // список перечитываем без перезагрузки страницы
    const onVis = () => { if (!document.hidden) loadProfiles() }
    document.addEventListener('visibilitychange', onVis)
    const t = setInterval(loadProfiles, 60000)
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t) }
  }, [loadProfiles])

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
  // Список движков вместе с их web-адресами. Запрос повторяем: если он упал (caddy перезапускался и
  // сайт на секунду отдал ошибку), webUrls оставался пустым НАВСЕГДА — и панель решала, что «при
  // установке движка не был указан домен», хотя домен записан и открывается. Именно это видел
  // пользователь после перезапуска caddy: домен он вписал, а вкладка Web просила переустановку.
  const loadWebUrls = async () => {
    for (let i = 0; i < 4; i++) {
      try {
        const d = await (await fetch('/api/harnesses')).json()
        const urls = {}
        for (const h of d.harnesses || []) if (h.webUrl) urls[h.id] = h.webUrl
        if (Object.keys(urls).length) { setWebUrls(urls); return urls }
      } catch {}
      await new Promise(r => setTimeout(r, 600 * (i + 1)))
    }
    return {}
  }
  useEffect(() => {
    let alive = true
    loadWebUrls().then(urls => {
      if (!alive) return
      // Hermes' dashboard is a plain virtual web UI — pre-fill its iframe. opencode
      // builds a session URL first, so it must NOT be pre-filled here.
      if (urls.hermes) setWebSrcCache(prev => (prev.hermes ? prev : { ...prev, hermes: urls.hermes }))
    })
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
        // Если список движков не догрузился, спрашиваем бэкенд ещё раз, прежде чем говорить
        // пользователю, что домен «не был указан при установке».
        const needBase = (id === 'opencode' || id === 'deepseek' || id === 'openclaw') && !webUrls[id]
        const bases = needBase ? await loadWebUrls() : webUrls
        const ocBase = bases.opencode || opencodeWebBase
        const dsBase = bases.deepseek || deepseekWebBase
        const olBase = bases.openclaw || openclawWebBase
        if ((id === 'deepseek' && !dsBase) || (id === 'openclaw' && !olBase)
            || (id === 'opencode' && !ocBase)) {
          setWebState('nodomain')
          return
        }
        // Cache the iframe src for this engine so future switches are instant.
        const src = id === 'opencode'
          ? (ocSessionId
              ? `${ocBase}/server/${opencodeServerKey}/session/${ocSessionId}`
              : `${ocBase}/server/${opencodeServerKey}`)
          : id === 'deepseek'
            ? `${dsBase}/${d?.token ? `?token=${d.token}` : ''}`
            : id === 'openclaw'
              ? olBase
              : `/agent/${id}/${d?.token ? `?token=${d.token}` : ''}`
        setWebSrcCache(prev => ({ ...prev, [id]: src }))
        setWebState('running')
      } catch { setWebState('running') }
    }
  }

  const [keypadOn, setKeypadOn] = useState(storedKeypad)
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

  // Смена движка/вида — тоже повод перечитать профили (мог появиться новый).
  // Объявлено здесь, а не выше: engine/useWeb/showWeb определяются только сейчас,
  // в списке зависимостей они читаются прямо во время рендера (TDZ-ошибка иначе).
  useEffect(() => { if (engine === 'hermes' && !showWeb) loadProfiles() }, [engine, showWeb, loadProfiles])

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
      const nf = Math.min(FONT_MAX, Math.max(FONT_MIN, prev + delta))
      try { localStorage.setItem(FONT_KEY, String(nf)) } catch {}
      const t = termRef.current
      if (t) { t.options.fontSize = nf; try { fitRef.current?.fit() } catch {} }
      // Кегль меняет ширину знакоместа → нужен чистый кадр. Полагаться на fit() нельзя: если
      // предложенные им размеры совпали с текущими, xterm не поднимает событие размера и
      // перерисовка не заказа́ется. Поэтому зовём путь resize напрямую.
      doResizeRef.current?.()
      return nf
    })
  }

  const sendExternal = (data) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'input', data }))
    }
  }

  // Прокрутка TUI. Сколько строк пользователь «уехал» вверх, считает обработчик касаний в эффекте
  // терминала; пока это число больше нуля, показываем плавающую кнопку «вниз».
  // Приём взят из Paperclip (`ui/src/components/ScrollToBottom.tsx`,
  // `ui/src/components/task-chat/scroll-navigation.tsx`): возврат к живому хвосту делает ЯВНАЯ
  // кнопка/событие, а не пересчёт по высоте содержимого — в alt-screen высоту содержимого вообще
  // не измерить (scrollHeight == clientHeight), а у них тот же принцип: якорь — логическая строка,
  // а не пиксели.
  const [scrolledUp, setScrolledUp] = useState(false)
  const upRowsRef = useRef(0)

  const jumpToBottom = () => {
    upRowsRef.current = 0
    setScrolledUp(false)
    // Отправляем серию отчётов «колесо вниз»: приложение само доедет до конца, а сколько именно
    // строк оно листает за отчёт, нам знать не нужно (это его внутренняя логика).
    let n = 0
    const tick = () => {
      if (n >= 40) return
      n += 1
      sendExternal('\x1b[<65;1;1M')
      window.setTimeout(tick, 14)
    }
    tick()
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

    // Терминал создаёт адаптер (xterm.js) — см. tui-engine.js.
    // Наружу он отдаёт поверхность xterm.js, поэтому вся логика ниже не зависит от движка.
    const { term, fit, kind: termKind } = createTuiEngine({
      el,
      fontSize: storedFontSize(),
      theme: getXtermTheme(),
      scrollback: 2000,
      cols: 120,
      rows: 40,
      onFallbackReady: (fb) => { termRef.current = fb.term; fitRef.current = fb.fit },
    })
    el.dataset.termEngine = termKind
    el.style.background = getXtermTheme().background
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
    // Размеры терминала И PTY берём из FitAddon: колонки и строки считаются по контейнеру и кеглю,
    // поэтому xterm, PTY и само TUI-приложение работают ровно в одном размере — как в обычном
    // терминале. Форсировать 120 колонок было ошибкой: из-за расхождения размера приложение
    // рисовало нижнюю панель со смещением (строка статуса склеивалась с подсказкой), а на телефоне
    // приходилось уменьшать шрифт до 4-5, чтобы увидеть всю ширину.
    const applyFit = () => {
      try { fit.fit() } catch {}
      return { cols: term.cols, rows: term.rows }
    }
    // Прокрутка TUI пальцем. Своего скроллбека у этой картинки НЕТ: TUI работает в alt-screen
    // (scrollHeight == clientHeight, строк в истории ноль), поэтому листать буфер терминала
    // невозможно в принципе. Зато приложение листает СВОЁ содержимое по отчётам колеса мыши —
    // проверено: после wheel-событий первая видимая строка менялась с /kanban на /init.
    // Поэтому движение пальца переводим в отчёты колеса SGR (64 — вверх, 65 — вниз): одна строка
    // пальца = один отчёт. Тап остаётся тапом (нет движения — ничего не отправляем).
    let touchY = 0, touchRows = 0, touching = false
    let flickTimer = null, flickPerTick = 0, lastMoveAt = 0, idleTimer = null
    const stopFlick = () => { if (flickTimer) { clearInterval(flickTimer); flickTimer = null } }
    const clearIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null } }
    const rowHeight = () => {
      const r = containerRef.current && containerRef.current.querySelector('.xterm-rows > div')
      const h = r && r.getBoundingClientRect().height
      return h || ((term.options.fontSize || 14) * 1.2)
    }
    const wheelReport = (deltaRows) => {
      if (!deltaRows) return
      const btn = deltaRows > 0 ? 64 : 65   // палец вниз => смотрим выше (колесо вверх)
      const seq = `\x1b[<${btn};1;1M`.repeat(Math.min(Math.abs(deltaRows), 6))
      // Счёт «уехали вверх» — по направлению жеста, без арифметики по высоте содержимого: её у
      // alt-screen нет. Ноль возвращает либо кнопка «вниз», либо жест обратно вниз.
      if (deltaRows > 0) upRowsRef.current += Math.abs(deltaRows)
      else upRowsRef.current = Math.max(0, upRowsRef.current - Math.abs(deltaRows))
      setScrolledUp(upRowsRef.current > 0)
      try {
        if (wsRef.current && wsRef.current.readyState === 1) {
          wsRef.current.send(JSON.stringify({ type: 'input', data: seq }))
        }
      } catch {}
    }
    const onTouchStart = (ev) => {
      stopFlick()
      if (ev.touches.length !== 1) return
      touching = true
      touchY = ev.touches[0].clientY
      touchRows = 0
      flickPerTick = 0
      lastMoveAt = performance.now()
    }
    const onTouchMove = (ev) => {
      if (!touching || ev.touches.length !== 1) return
      const rows = Math.round((ev.touches[0].clientY - touchY) / rowHeight())
      const steps = rows - touchRows
      if (!steps) return
      touchRows = rows
      const now = performance.now()
      const dt = Math.max(1, now - lastMoveAt)
      lastMoveAt = now
      // скорость в строках на кадр (16 мс) — из неё получится инерция после отпускания
      flickPerTick = Math.max(-6, Math.min(6, (steps / dt) * 16))
      wheelReport(steps)
      // `touchend` приходит не всегда: если палец ушёл с элемента или жест прервали, браузер молчит
      // (проверено в отладке: до обработчика дошли только start/move). Поэтому конец жеста
      // определяем ещё и по паузе в движениях — 120 мс без событий считаем отпусканием.
      clearIdle()
      idleTimer = setTimeout(() => onTouchEnd(), 120)
      ev.preventDefault()
    }
    const onTouchEnd = () => {
      clearIdle()
      if (!touching) return
      touching = false
      // Инерция: палец отпущен, но список продолжает ехать с затуханием — как в мобильных лентах.
      // Скорость жеста в отладке недостоверна: Chromium склеивает синтетические touchmove, и после
      // быстрого свайпа в сокет уходил всего один отчёт. Поэтому инерцию включаем ещё и по
      // пройденному пути: если палец прошёл больше 4 строк, добавляем затухающий «довод».
      let v = flickPerTick, ticks = 0
      const dist = Math.abs(touchRows)
      if (dist >= 3) v = Math.sign(touchRows) * Math.max(Math.abs(v), Math.min(4, 1 + dist / 4))
      if (Math.abs(v) < 0.6) { flickPerTick = 0; return }
      // Шаг между отчётами — 70 мс, не 16: приложение глотает слишком частые отчёты колеса
      // (проверено: 5 отчётов с шагом 200 мс листают, а очередь с шагом 16 мс не двигает ничего).
      flickTimer = setInterval(() => {
        v *= 0.8
        ticks += 1
        wheelReport(v > 0 ? Math.max(1, Math.round(v)) : Math.min(-1, Math.round(v)))
        if (Math.abs(v) < 0.5 || ticks >= 8) { stopFlick(); flickPerTick = 0 }
      }, 70)
    }
    const termEl = containerRef.current
    if (termEl) {
      termEl.addEventListener('touchstart', onTouchStart, { passive: true })
      termEl.addEventListener('touchmove', onTouchMove, { passive: false })
      termEl.addEventListener('touchend', onTouchEnd, { passive: true })
      termEl.addEventListener('touchcancel', onTouchEnd, { passive: true })
    }
    let pendingWrite = ''
    let flushRaf = 0
    let gotData = false
    const flushWrites = () => {
      flushRaf = 0
      const d = pendingWrite
      pendingWrite = ''
      if (d) { try { term.write(d) } catch {} }
    }
    let lastSentSize = ''
    // Ширину менять можно, высоту — нет. Показ/скрытие экранной клавиатуры меняет высоту десятки раз
    // за анимацию, и каждый SIGWINCH заставляет Ink перерисовать кадр целиком: старые кадры копятся в
    // скроллбеке, и внизу остаются копии строки статуса (после /help их видно две подряд — одна со
    // старым таймером). Тот же вывод уже зафиксирован в SplitPane: там на мобильном PTY не ресайзят
    // вообще. Поэтому в PTY уходит только смена ШИРИНЫ (поворот, смена кегля), а высота — подгонка вида.
    let lastSentCols = 0
    const sendSizeToPty = () => {
      if (!wsRef.current || wsRef.current.readyState !== 1) return
      if (term.cols === lastSentCols) return
      lastSentCols = term.cols
      wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }
    // Смена размера идёт сериями: выезд экранной клавиатуры — это десятки кадров анимации, каждый
    // со своей высотой. Отправлять resize на каждый кадр нельзя: приложение перерисовывает кадр
    // столько же раз, и нижняя строка остаётся копиями. Склеиваем серию в одно сообщение.
    let sizeTimer = null
    const sendSizeSoon = () => {
      if (sizeTimer) clearTimeout(sizeTimer)
      sizeTimer = setTimeout(() => {
        sendSizeToPty()
        scheduleCleanRepaint()
      }, 250)
    }
    // Раньше здесь после каждого изменения размера делались term.clear() и SIGWINCH-нудж
    // приложению, плюс чистка по таймеру каждые 15 с. Это и было главным источником мигания:
    // полная очистка экрана + полный кадр = вспышка на весь терминал, а нудж — это дёргание
    // размера на строку, заставляющее приложение перерисоваться целиком (практика встраивания
    // TUI прямо предупреждает: «never thrash WINCH… visible flicker»). Поэтому:
    //   • очисток экрана нет вообще,
    //   • WINCH-нудж заказывается только когда экран пуст,
    //   • после изменения размера просто перерисовываем уже имеющееся содержимое: term.refresh().
    doResizeRef.current = null
    let repaintTimer = null
    let lastInputAt = 0
    const refreshScreen = () => {
      if (document.hidden) return
      // refresh() перерисовывает буфер по текущему размеру. Он же лечит «частичный кадр», который
      // Chromium оставляет на канвасе до следующей записи вывода.
      try { term.refresh(0, Math.max(0, term.rows - 1)) } catch {}
    }
    let lastRepaintKey = ''
    // берём кегль у самого xterm: fontSize из замыкания эффекта может быть устаревшим
    const repaintKey = () => `${term.options.fontSize}x${containerRef.current ? containerRef.current.clientWidth : 0}`
    const scheduleCleanRepaint = () => {
      if (repaintTimer) clearTimeout(repaintTimer)
      // Всплеск мелких изменений высоты (адресная строка Chrome, тулбар) → одна перерисовка.
      repaintTimer = setTimeout(refreshScreen, 600)
    }
    const doResize = () => {
      // Размер ДО подгонки: applyFit() внутри вызывает fit(), который сам поднимает onResize и
      // обновляет lastSentSize, поэтому сравнивать надо с прежним значением, иначе «changed»
      // всегда ложно и чистый кадр после смены раскладки не заказывается.
      const before = lastSentSize
      const { cols, rows } = applyFit()
      const key = `${cols}x${rows}`
      const changed = key !== before
      const widthOrFontChanged = repaintKey() !== lastRepaintKey
      lastSentSize = key
      publishSize()
      sendSizeSoon()
      // Чистый кадр нужен и при смене ширины/кегля, и при смене ВЫСОТЫ: на смене высоты Ink
      // перерисовывает кадр, но старые строки приглашения остаются «призраками» — на скрине
      // пользователя их было четыре подряд под строкой статуса. `widthOrFontChanged` ловит
      // смену кегля (число строк при шаге на 1px может не измениться), `changed` — остальное.
      if (changed || widthOrFontChanged) {
        lastRepaintKey = repaintKey()
        scheduleCleanRepaint()
      }
    }
    // подгоняем терминал под контейнер сразу после раскладки, до первого вывода
    try { fit.fit() } catch {}
    // Диагностика для проверок: что реально у xterm и что мы сказали PTY. Если разъедется,
    // Ink начнёт писать 120-колоночные строки в экран другой ширины — обрывки вроде
    // `tery "/help" for commands` и дублированная строка статуса внизу.
    const publishSize = () => {
      const c = containerRef.current
      if (!c) return
      c.dataset.termSize = `${term.cols}x${term.rows}`
      c.dataset.ptySize = lastSentSize || `${term.cols}x${term.rows}`
    }
    // xterm может менять размер сам (свой ResizeObserver/FitAddon) — сразу сообщаем новый размер
    // в PTY, чтобы приложение не осталось с прежним представлением о терминале.
    const keepSizeInSync = term.onResize(({ cols, rows }) => {
      const key = `${cols}x${rows}`
      const changed = key !== lastSentSize
      lastSentSize = key
      publishSize()
      // Именно здесь ловится реальная смена размера: fit() сначала меняет term.cols/rows, и к
      // моменту проверки в doResize размер уже совпадает — без этой ветки чистый кадр не
      // заказывался вообще (в замере уходили одни resize без repaint).
      if (changed) sendSizeSoon()
    })
    // NOTE: no post-spawn resize loop — the PTY boots at the exact rows (via URL
    // params) and re-resizing an Ink TUI after spawn makes it redraw skewed.
    // Only a real window resize triggers a new resize message.
    setTimeout(doResize, 50)
    fitRef.current = fit
    termRef.current = term
    doResizeRef.current = doResize
    // Смена раскладки (скрыть/показать клавиатуру, перенос тулбара) меняет высоту контейнера
    // БЕЗ события window.resize — без наблюдателя PTY остаётся в старом размере, и Ink
    // оставляет призрачные строки приглашения. ResizeObserver закрывает этот случай.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => doResize()) : null
    if (ro) { try { ro.observe(containerRef.current) } catch {} }

    // Only connect TUI WebSocket when NOT in Web UI mode
    const connect = () => {
      if (showWeb) {
        setConn('web')
        return
      }
      setConn('connecting')
      // WSS via same origin (Caddy proxies /ws/* to backend)
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${location.host}/ws/tui?engine=${engine}&profile=${agent}&cols=${term.cols}&rows=${term.rows}&theme=${themeDarkRef.current ? 'dark' : 'light'}`)
      wsRef.current = ws

      ws.onopen = () => {
        setConn('connected')
        // Экран НЕ стираем и полный кадр у приложения заказываем ТОЛЬКО если экран пуст.
        // SIGWINCH-нудж — это дёргание размера на строку, заставляющее приложение перерисоваться
        // целиком; на каждом переподключении это и выглядело как мигание. Когда содержимое уже
        // есть, достаточно перерисовать буфер на клиенте.
        if (!gotData) {
          try { ws.send(JSON.stringify({ type: 'repaint', cols: term.cols, rows: term.rows })) } catch {}
        } else {
          refreshScreen()
        }
        // Сообщаем фактический размер после того, как раскладка устоялась (без заказа кадра):
        // PTY рождается с rows, посчитанными ДО финальной раскладки, и Ink тогда рисует кадр
        // выше/ниже видимой области.
        setTimeout(() => {
          // один раз после коннекта: PTY рождается с размерами ДО финальной раскладки
          lastSentCols = 0
          sendSizeToPty()
        }, 500)
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'data') {
            // Вывод PTY склеиваем по кадру анимации: середина перерисовки (батч CSI-последовательностей)
            // иначе попадает в разные write'ы, и xterm перерисовывает регион по частям — это заметное
            // дрожание. Один write за кадр = одна перерисовка (совет из практики встраивания TUI).
            gotData = true
            pendingWrite += msg.data
            if (!flushRaf) flushRaf = requestAnimationFrame(flushWrites)
            // Detect agent state from terminal output (Herdr-style)
            if (msg.data && typeof msg.data === 'string') {
              setAgentState(prev => detectAgentState(msg.data, prev))
            }
          }
          else if (msg.type === 'exit') { setConn('exited'); term.writeln(`\r\n\x1b[31m[TUI exited code ${msg.code}]\x1b[0m`) }
          else if (msg.type === 'restarting') { restarting = true; setConn('starting'); try { ws.close() } catch {} }
        } catch { term.write(String(ev.data)) }
      }
      ws.onclose = () => {
        if (restarting) {
          // Это мы сами попросили перезапуск — не показываем «disconnect», а подключаемся заново.
          restarting = false
          setConn('starting')
          setTimeout(() => { try { connect() } catch {} }, 600)
          return
        }
        if (!showWebRef.current) setConn('disconnected')
      }
      ws.onerror = () => {
        if (!showWebRef.current) setConn('error')
      }
    }

    // Перезапуск сессии движка по кнопке: шлём {type:'restart'} и после ответа подключаемся заново.
    let restarting = false
    restartRef.current = () => {
      try {
        if (wsRef.current && wsRef.current.readyState === 1) wsRef.current.send(JSON.stringify({ type: 'restart' }))
        else connect()
      } catch { try { connect() } catch {} }
    }

    // Подключаемся к PTY, когда терминал готов (у xterm.js — сразу).
    if (term.whenReady) term.whenReady(() => connect())
    else connect()

    // input -> WS
    const onData = term.onData((data) => {
   lastInputAt = Date.now()
      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }))
      }
    })
    const onResize = () => {
      if (!termRef.current || !fitRef.current) return
      try { fitRef.current.fit() } catch {}
      doResize()   // меряем строки по контейнеру и чистим экран при смене размера
    }
    window.addEventListener('resize', onResize)
    // ВАЖНО: на выезд экранной клавиатуры НЕ реагируем. Она меняет только visual viewport, а
    // раскладка страницы остаётся прежней, поэтому переразмечать терминал по ней не нужно — и
    // вредно: каждая смена числа строк заставляет TUI-приложение перерисовать кадр, и его нижняя
    // строка остаётся копией (жалоба «после открытия клавиатуры телефона дублируется нижняя
    // строчка»). Размер меняем только по фактической раскладке: window.resize, ResizeObserver на
    // контейнере и смена кегля.

    return () => {
      if (termEl) {
        termEl.removeEventListener('touchstart', onTouchStart)
        termEl.removeEventListener('touchmove', onTouchMove)
        termEl.removeEventListener('touchend', onTouchEnd)
        termEl.removeEventListener('touchcancel', onTouchEnd)
      }
      try { themeObserver.disconnect() } catch {}
      try { keepSizeInSync.dispose() } catch {}
      if (ro) { try { ro.disconnect() } catch {} }
      onData.dispose()
      stopFlick()
      clearIdle()
      window.removeEventListener('resize', onResize)
      if (repaintTimer) clearTimeout(repaintTimer)
      if (sizeTimer) clearTimeout(sizeTimer)
      // таймерной чистки кадра больше нет: она давала видимую вспышку каждые 15 с
      if (flushRaf) cancelAnimationFrame(flushRaf)
      // визуальный вьюпорт больше не слушаем — см. комментарий в начале эффекта
      // null the refs BEFORE disposing so a late window-resize can't call
      // fit() on a disposed terminal (throws "reading 'dimensions'")
      termRef.current = null
      fitRef.current = null
      try { wsRef.current?.close() } catch {}
      try { term.dispose() } catch {}
    }
    // webPorts[engine] — ПРИМИТИВ. Раньше в массиве стоял объект webPorts: каждый fetch списка
    // движков создавал новый объект, эффект перезапускался, сокет терминала рвался и подключался
    // заново десятками раз — в логах это «ws connected → ws closed» через секунду и мигающий
    // статус «disconnect» в панели.
    // webPorts здесь больше нет вовсе: эффект терминала не зависит от списка движков. Даже
    // примитив webPorts[engine] менялся с undefined на номер, когда приходил /api/harnesses, —
    // эффект перезапускался и рвал сокет в первый же момент после загрузки страницы.
  }, [agent, engine, showWeb, fullscreen])

  // Перезапуск сессии движка из панели: сессия живёт в tmux долго, поэтому зависший интерфейс
  // иначе сбрасывается только из консоли. Кнопка шлёт {type:'restart'}, бэкенд убивает сессию,
  // панель подключается заново.
  const restartRef = useRef(null)
  // Вид чата: терминал (как раньше) или лента сообщений из истории движка.
  const [chatView, setChatView] = useState(() => {
    try { return localStorage.getItem('lifeos.chat.view') || 'tui' } catch { return 'tui' }
  })
  const setView = (v) => { setChatView(v); try { localStorage.setItem('lifeos.chat.view', v) } catch {} }

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
        <button onClick={() => setKeypadOn(v => {
          const nv = !v
          try { localStorage.setItem(KEYPAD_KEY, nv ? '1' : '0') } catch {}
          return nv
        })}
          className={`ml-1 px-2 py-1 rounded text-xs shrink-0 border transition-colors ${keypadOn ? 'bg-accent text-white border-accent' : 'bg-bg-card border-border text-text-muted hover:text-text'}`}
          title="Показать/скрыть клавиатуру">⌨</button>
        {/* Терминал или лента из истории движка. Лента — обычная прокрутка, без alt-screen и
            мёртвого скроллбека; пока только у Hermes (для него есть адаптер истории). */}
        {engine === 'hermes' && (
          <button onClick={() => setView(chatView === 'tui' ? 'chat' : 'tui')}
            className={`ml-1 px-2 py-1 rounded text-xs shrink-0 border transition-colors ${chatView === 'chat' ? 'bg-accent text-white border-accent' : 'bg-bg-card border-border text-text-muted hover:text-text'}`}
            title="Переключить вид: терминал или лента сообщений из истории движка">
            {chatView === 'tui' ? '📜 Лента' : '💻 Терминал'}
          </button>
        )}
        <button onClick={() => restartRef.current?.()}
          className="ml-1 px-2 py-1 rounded text-xs shrink-0 border border-border bg-bg-card text-text-muted hover:text-text transition-colors"
          title="Перезапустить сессию движка (сбросить зависший интерфейс)">🔄</button>
        {/* Движок терминала выбирается в Настройках («Терминал Chat · движок отрисовки»). */}
        {/* Web-режим: вход и внешнее открытие. У дашбордов движков своя страница входа;
            логин-пароль вводится прямо здесь, а OAuth (Nous Portal) невозможен внутри
            фрейма — портал запрещает фрейминг (CSP frame-ancestors 'none'), поэтому запуск
            входа выносится в отдельную вкладку, после чего ↻ подхватывает сессию. */}
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
                title="Вход через Nous Portal в новой вкладке (внутри фрейма портал себя фреймить не даёт); после входа вернись в панель и нажми ↻">🔑 Nous</button>
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
      {!showWeb && chatView === 'chat' && <TranscriptView agent={agent} themeDark={themeDark} />}
      {/* Терминал НЕ размонтируем при переключении вида: размонтирование забирало DOM-узел xterm,
          сам терминал и его WS оставались жить, и возврат в терминал показывал пустоту. Скрываем
          так же, как уже сделано для web-интерфейсов движков ниже. */}
      {!showWeb && (
        <div className="flex-1 min-h-0 flex flex-col" style={{ display: chatView === 'tui' ? 'flex' : 'none' }}>
          {/* Ширина полосы прокрутки = 120 колонок при текущем шрифте: мелкий шрифт реально
              вмещает TUI в экран, крупный доступен горизонтальным свайпом. min-w-0 обязателен —
              без него flex-элемент растягивается под внутреннюю ширину и прокрутки не будет
              (раньше стоял overflow-hidden при жёстких 900px: правый край было не достать). */}
          <div className="relative flex-1 min-h-0 flex flex-col">
            <div className="flex-1 w-full min-w-0 overflow-x-auto overflow-y-hidden" style={{ minHeight: '280px' }}>
              <div style={{ width: '100%', height: '100%' }}>
                <div ref={containerRef} className="w-full h-full" />
              </div>
            </div>
            {/* Листание вверх: у alt-screen нет полосы прокрутки, поэтому единственная подсказка,
                что мы выше живого хвоста, — эта кнопка (приём Paperclip: явный возврат вместо
                арифметики по высоте). */}
            {scrolledUp && (
              <button onClick={jumpToBottom} title="Вниз, к живому хвосту вывода"
                className="absolute right-2 bottom-2 z-10 w-9 h-9 rounded-full border border-border shadow-lg flex items-center justify-center text-lg bg-bg-card text-text-muted hover:text-text"
                style={{ opacity: 0.9 }}>↓</button>
            )}
          </div>
          {/* on-screen keypad only for touch/narrow screens — laptops have a real keyboard */}
          {keypadOn && (
            <div className="lg:hidden">
              <TermKeypad onSend={sendExternal} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}