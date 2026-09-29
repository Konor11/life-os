import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icons'
import { EmptyState } from './PanelUX'

// «Живой» режим Второго мозга: то, что раньше приходилось делать руками.
// Панель читает историю разговоров с агентами (SQLite Hermes, только на чтение) и показывает:
//   * черновики заметок, выдержанные из сообщений-выводов, С ИСТОЧНИКОМ (диалог, сообщение, дата);
//   * поиск сразу по всем диалогам;
//   * темы, которые обсуждались, и связи между разговорами по общим темам;
//   * переход к самому разговору — «источник» кликабельный, это не выдумка.
//
// Честные ограничения, о которых стоит помнить: индекс пересобирается целиком (кнопка или
// автосборка при старте), заметки-черновики отбираются простым правилом (длина + маркеры вывода),
// поэтому это отправная точка для правки, а не священный текст. Каждую заметку можно
// превратить в обычную заметку раздела «Граф» — тогда она твоя и живёт дальше.

const fmtDate = (ts) => {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const SOURCE_LABELS = {
  telegram: 'Telegram', tui: 'TUI', cli: 'CLI', cron: 'cron', desktop: 'Desktop', api_server: 'API',
}

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.error || `запрос не удался (${r.status})`)
  }
  return r.json()
}

export function LiveBrain({ onPromote }) {
  const [tab, setTab] = useState('notes')      // notes | search | topics | sessions
  const [status, setStatus] = useState(null)   // { built, generatedAt, stats }
  const [notes, setNotes] = useState([])
  const [relations, setRelations] = useState([])
  const [sessions, setSessions] = useState([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [source, setSource] = useState(null)   // открытый разговор
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const loadStatus = useCallback(async () => {
    try { setStatus(await getJson('/api/lbrain/status')) } catch (e) { setErr(e.message) }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const reindex = async () => {
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await fetch('/api/lbrain/index', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error || 'не получилось'); return }
      setMsg(`Индекс пересобран: ${j.stats.sessions} разговоров, ${j.stats.notes} заметок`)
      await loadStatus()
      setNotes((await getJson('/api/lbrain/notes')).notes || [])
      setRelations((await getJson('/api/lbrain/relations')).relations || [])
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const doSearch = async () => {
    const query = q.trim()
    if (query.length < 2) return
    setSearching(true); setErr('')
    try {
      const j = await getJson(`/api/lbrain/search?q=${encodeURIComponent(query)}&limit=40`)
      setResults(j.results || [])
      setTab('search')
    } catch (e) { setErr(e.message) } finally { setSearching(false) }
  }

  const openSource = async (id) => {
    setErr('')
    try { setSource(await getJson(`/api/lbrain/session?id=${encodeURIComponent(id)}`)) }
    catch (e) { setErr(e.message) }
  }

  // Первичная загрузка содержимого вкладок
  useEffect(() => {
    if (!status?.built) return
    ;(async () => {
      try {
        if (tab === 'notes' && !notes.length) {
          const j = await getJson('/api/lbrain/notes')
          setNotes(j.notes || [])
        }
        if (tab === 'topics' && !relations.length) {
          setRelations((await getJson('/api/lbrain/relations')).relations || [])
        }
        if (tab === 'sessions' && !sessions.length) {
          setSessions((await getJson('/api/lbrain/sessions?limit=100')).sessions || [])
        }
      } catch (e) { setErr(e.message) }
    })()
  }, [tab, status?.built])

  const tabBtn = (id, label, icon) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        tab === id ? 'bg-accent text-white' : 'text-text-muted hover:text-text hover:bg-bg-elevated'
      }`}
    >
      <Icon name={icon} size={13} /> {label}
    </button>
  )

  // ---- ещё не собрано ----
  if (status && !status.built) {
    return (
      <div className="glass p-4 rounded-xl">
        <EmptyState
          icon="Database" mascot="idle"
          title="Индекс разговоров ещё не собран"
          hint="Индексатор читает историю диалогов с агентами и строит из неё заметки, темы и связи. Это производные данные: их можно в любой момент пересобрать заново, ничего не теряется."
          action={busy ? 'Собираю…' : 'Собрать индекс сейчас'}
          onAction={reindex}
        />
        {err && <div className="text-xs text-danger text-center pb-3">{err}</div>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Шапка: что вообще проиндексировано — чтобы было видно, это не выдумка */}
      <div className="glass p-3 rounded-xl flex flex-wrap items-center gap-3">
        <Icon name="Database" size={16} className="text-accent" />
        <div className="text-xs text-text-muted flex-1 min-w-0">
          {status?.stats ? (
            <>
              <span className="text-text font-medium">{status.stats.sessions} разговоров</span>
              {' · '}{status.stats.messages} сообщений
              {' · '}{status.stats.notes} черновиков заметок
              {' · '}{status.stats.topics} тем
              {status.generatedAt && <> {' · '} собран {new Date(status.generatedAt.replace(' ', 'T')).toLocaleString('ru-RU')}</>}
            </>
          ) : 'загружаю…'}
        </div>
        <button onClick={reindex} disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-text disabled:opacity-60">
          {busy ? 'Собираю…' : 'Пересобрать индекс'}
        </button>
      </div>

      {/* Поиск по всем диалогам */}
      <div className="glass p-3 rounded-xl flex items-center gap-2">
        <Icon name="Search" size={15} className="text-text-muted" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Поиск по всем разговорам с агентами…"
          className="flex-1 bg-transparent outline-none text-sm text-text placeholder:text-text-muted"
        />
        <button onClick={doSearch} disabled={searching || q.trim().length < 2}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs disabled:opacity-50">
          {searching ? 'Ищу…' : 'Найти'}
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {tabBtn('notes', 'Заметки из диалогов', 'Sparkles')}
        {tabBtn('search', 'Результаты поиска', 'Search')}
        {tabBtn('topics', 'Темы и связи', 'Link')}
        {tabBtn('sessions', 'Разговоры', 'MessageSquare')}
      </div>

      {msg && <div className="text-xs text-success px-1">{msg}</div>}
      {err && <div className="text-xs text-danger px-1">{err}</div>}

      {/* ------------------------------------------------ заметки из диалогов ---- */}
      {tab === 'notes' && (
        notes.length === 0 ? (
          <div className="glass p-4 rounded-xl">
            <EmptyState icon="Sparkles" mascot="idle" title="Черновиков пока нет"
              hint="Они появляются из сообщений агентов, где есть вывод или решение. Пока таких нет — нажмите «Пересобрать индекс»." action="Пересобрать индекс" onAction={reindex} />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-text-muted px-1">
              Это выдержки из выводов агентов. Нажмите «Перенести», чтобы сделать заметку своей и
              отредактировать её в разделе «Граф».
            </p>
            {notes.map(n => (
              <div key={n.id} className="glass p-3 rounded-xl">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text font-medium">{n.title}</div>
                    <p className="text-xs text-text-muted mt-1 line-clamp-3">{n.content}</p>
                    {/* Источник — кликабельный переход к самому разговору */}
                    <button
                      onClick={() => openSource(n.source.sessionId)}
                      className="mt-2 flex items-center gap-1.5 text-[11px] text-accent hover:underline"
                      title="Открыть разговор-источник"
                    >
                      <Icon name="CornerDownLeft" size={12} />
                      {n.source.sessionTitle}
                      <span className="text-text-muted">
                        · {SOURCE_LABELS[n.source.source] || n.source.source} · {fmtDate(n.source.ts)}
                      </span>
                    </button>
                  </div>
                  {onPromote && (
                    <button
                      onClick={() => onPromote(n)}
                      className="px-2.5 py-1 rounded-lg border border-border text-text-muted text-xs hover:text-text shrink-0"
                      title="Перенести в свои заметки"
                    >
                      Перенести
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ----------------------------------------------------- результаты ---- */}
      {tab === 'search' && (
        results.length === 0 ? (
          <div className="glass p-4 rounded-xl">
            <EmptyState icon="Search" mascot="idle"
              title={searching ? 'Ищу…' : 'Ничего не нашлось'}
              hint={searching ? 'Ищу по всем диалогам.' : 'Попробуй другое слово или фразу — ищет по сообщениям агентов и тебя во всех разговорах.'} />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-text-muted px-1">Найдено {results.length} сообщений</p>
            {results.map(r => (
              <button key={`${r.sessionId}-${r.messageId}`} onClick={() => openSource(r.sessionId)}
                className="glass p-3 rounded-xl w-full text-left hover:bg-bg-elevated/50 transition-colors">
                <div className="flex items-center gap-2 text-[11px] text-text-muted">
                  <span className={r.role === 'user' ? 'text-accent' : 'text-success'}>
                    {r.role === 'user' ? 'Ты' : 'Агент'}
                  </span>
                  <span className="truncate">{r.sessionTitle}</span>
                  <span className="ml-auto shrink-0">{fmtDate(r.ts)}</span>
                </div>
                <p className="text-xs text-text mt-1.5 line-clamp-3">{r.snippet}</p>
              </button>
            ))}
          </div>
        )
      )}

      {/* -------------------------------------------------- темы и связи ---- */}
      {tab === 'topics' && (
        status?.topics?.length ? (
          <div className="space-y-3">
            <div className="glass p-3 rounded-xl">
              <div className="text-xs text-text-muted mb-2">Что обсуждалось чаще всего</div>
              <div className="flex flex-wrap gap-1.5">
                {status.topics.map(t => (
                  <span key={t.topic}
                    className="px-2 py-1 rounded-lg bg-accent/10 text-accent text-xs"
                    title={`${t.mentions} упоминаний, разговоров: ${t.sessions.length}`}>
                    {t.topic} <span className="opacity-60">{t.mentions}</span>
                  </span>
                ))}
              </div>
            </div>
            {relations.slice(0, 30).map(r => (
              <div key={r.id} className="glass p-3 rounded-xl">
                <div className="text-sm text-text font-medium truncate">{r.title}</div>
                <div className="text-[11px] text-text-muted mt-0.5">связан с:</div>
                <div className="mt-1.5 space-y-1">
                  {r.related.map(rel => (
                    <button key={rel.id} onClick={() => openSource(rel.id)}
                      className="w-full text-left text-xs text-text hover:text-accent flex items-start gap-2">
                      <Icon name="Link" size={11} className="text-text-muted mt-0.5 shrink-0" />
                      <span className="flex-1">
                        <span className="truncate block">{rel.shared.join(', ')}</span>
                      </span>
                      <span className="text-text-muted shrink-0">{rel.weight}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass p-4 rounded-xl">
            <EmptyState icon="Link" mascot="idle" title="Тем пока нет"
              hint="Темы появляются, когда в разговорах набираются повторяющиеся слова — нужно хотя бы несколько обсуждений." />
          </div>
        )
      )}

      {/* ------------------------------------------------------ разговоры ---- */}
      {tab === 'sessions' && (
        <div className="space-y-1.5">
          <p className="text-xs text-text-muted px-1">Все разговоры, из которых сделан индекс. Нажми — откроется переписка.</p>
          {sessions.map(s => (
            <button key={s.id} onClick={() => openSource(s.id)}
              className="glass p-3 rounded-xl w-full text-left hover:bg-bg-elevated/50 transition-colors">
              <div className="text-sm text-text">{s.title}</div>
              <div className="text-[11px] text-text-muted mt-1 flex items-center gap-2 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-bg-elevated">{SOURCE_LABELS[s.source] || s.source}</span>
                {s.profile !== 'default' && <span>профиль: {s.profile}</span>}
                <span>сообщений: {s.messageCount}</span>
                <span>{fmtDate(s.last_activity_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* --------------------------------------------- просмотр источника ---- */}
      {source && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setSource(null)}>
          <div className="w-full max-w-3xl max-h-[85vh] rounded-xl overflow-hidden flex flex-col shadow-2xl border border-border"
            style={{ background: 'rgb(var(--cx-bg-card))' }} onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Icon name="MessageSquare" size={15} className="text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text font-medium truncate">{source.title}</div>
                <div className="text-[11px] text-text-muted">
                  {SOURCE_LABELS[source.source] || source.source} · сообщений: {source.messages?.length || 0}
                  {source.model && ` · ${source.model}`}
                </div>
              </div>
              <button onClick={() => setSource(null)} className="p-1.5 rounded-lg text-text-muted hover:text-text">
                <Icon name="X" size={16} />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              {(source.messages || []).map(m => (
                <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  m.role === 'user' ? 'ml-auto bg-accent/15' : 'bg-bg-elevated'}`}>
                  <div className="text-[10px] text-text-muted mb-1">
                    {m.role === 'user' ? 'Ты' : 'Агент'} · {fmtDate(m.ts)}
                  </div>
                  <p className="text-xs text-text whitespace-pre-wrap break-words">{m.text}</p>
                </div>
              ))}
              {!(source.messages || []).length && (
                <div className="text-center text-sm text-text-muted py-8">Сообщений не найдено</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
