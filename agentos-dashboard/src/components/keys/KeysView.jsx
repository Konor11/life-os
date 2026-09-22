import { useState, useEffect } from 'react'

const API = '/api'

// Tabs: each installed/all agent + an "Все ключи" overview.
export function KeysView() {
  const [agents, setAgents] = useState([])
  const [allKeys, setAllKeys] = useState([])
  const [harnesses, setHarnesses] = useState([])
  const [tab, setTab] = useState('all')
  const [busy, setBusy] = useState(null)  // {agentId, keyVar}
  const [lastSync, setLastSync] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)

  const load = async () => {
    try {
      const [ka, kd, hd] = await Promise.all([
        fetch(`${API}/keys/agents`).then(r => r.json()),
        fetch(`${API}/keys`).then(r => r.json()),
        fetch(`${API}/harnesses`).then(r => r.json()),
      ])
      setAgents(ka.agents || [])
      setAllKeys(kd.keys || [])
      setHarnesses(hd.harnesses || [])
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const sync = async (agentId, keyVar, value) => {
    setBusy(`${agentId}:${keyVar}`); setError(null)
    try {
      // Prefer the agent-scoped endpoint so OpenClaw's gateway token is written to its
      // own config, not mirrored as an env var it can't read.
      const r = await fetch(`${API}/agent-keys/sync`, { method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ agent: agentId, keyVar, value: value || null }) })
      const d = await r.json()
      if (d.agents) setLastSync({ agentId, keyVar, results: d.agents })
      else setLastSync({ agentId, keyVar, msg: d.error || d.detail || 'ok' })
    } catch (e) { setError(e.message) }
    setBusy(null)
  }

  const copyName = async (v) => {
    try { await navigator.clipboard.writeText(v); setCopied(v); setTimeout(() => setCopied(null), 1200) } catch {}
  }
  const copyVal = async (v, label) => {
    try {
      await navigator.clipboard.writeText(v)
      setCopied(`val:${label}`); setTimeout(() => setCopied(null), 1500)
    } catch {}
  }

  const agentTabs = ['all', ...agents.map(a => a.id)]
  const activeAgent = tab === 'all' ? null : agents.find(a => a.id === tab)
  const installedNames = harnesses.filter(h => h.installed).map(h => h.name).join(', ') || '—'

  const renderKey = (k, agentId) => (
    <div key={k.env} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-bg-card border border-border">
      <div className="flex flex-col min-w-0 flex-1">
        <button onClick={() => copyName(k.env)} title="Скопировать название"
          className={`text-sm font-mono text-left truncate ${copied === k.env ? 'text-success' : 'text-text'}`}>
          {k.env} {copied === k.env ? '✓' : ''}
        </button>
        <span className="text-[11px] text-text-muted truncate">
          {k.length} символов · {k.masked}
          {k.agentToken ? ' · из конфига агента' : ` · ${k.source || ''}`}
        </span>
        {k.desc && <span className="text-[11px] text-text-muted/70 mt-0.5">{k.desc}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => copyVal(k.value, k.env)} title="Копировать значение ключа"
          className={`px-2.5 py-1.5 rounded-lg text-xs border shrink-0 ${copied === `val:${k.env}` ? 'text-success border-success/40' : 'text-text-muted border-border hover:text-accent hover:border-accent/50'}`}>
          {copied === `val:${k.env}` ? '✓ Скопировано' : '⧉ Ключ'}
        </button>
        <button onClick={() => sync(agentId, k.env, k.value)} disabled={busy}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${busy === `${agentId}:${k.env}` ? 'opacity-60' : ''}`}
          style={{ background: busy === `${agentId}:${k.env}` ? '#444' : 'linear-gradient(180deg,#6a7bff,#5865f2)', color: '#fff' }}>
          {busy === `${agentId}:${k.env}` ? 'Синхронизирую...' : '🔄 Синхронизировать'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
      <h1 className="text-2xl font-bold text-text">Ключи</h1>
        <p className="text-text-muted">
          Ключи сгруппированы по агентам. Кнопка <b>«Синхронизировать»</b> передаёт ключ конкретному агенту.
          Установлено: <b>{installedNames}</b>.
        </p>
      </div>

      {/* Вкладки по агентам */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
        <button onClick={() => setTab('all')}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${tab === 'all' ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-elevated hover:text-text'}`}>
          Все ключи
        </button>
        {agents.map(a => (
          <button key={a.id} onClick={() => setTab(a.id)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${tab === a.id ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-elevated hover:text-text'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${a.installed ? 'bg-success' : 'bg-text-muted/40'}`} />
            {a.name}
            {!a.installed && <span className="text-[10px] opacity-70">· не уст.</span>}
          </button>
        ))}
      </div>

      {tab === 'all' ? (
        <div className="glass rounded-xl p-4">
          <h3 className="font-semibold text-text mb-1">Все ключи ({allKeys.length})</h3>
          <p className="text-[11px] text-text-muted mb-3">Общий список из .env. Ниже — по агентам.</p>
          <div className="space-y-2">
            {allKeys.map(k => (
              <div key={k.env} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-bg-card border border-border">
                <div className="flex flex-col">
                  <button onClick={() => copyName(k.env)} title="Скопировать название"
                    className={`text-sm font-mono text-left ${copied === k.env ? 'text-success' : 'text-text'}`}>
                    {k.env} {copied === k.env ? '✓' : ''}
                  </button>
                  <span className="text-[11px] text-text-muted">{k.length} символов · {k.masked}</span>
                </div>
                <button onClick={() => copyVal(k.value, k.env)} title="Копировать значение ключа"
                  className={`px-2.5 py-1.5 rounded-lg text-xs border shrink-0 ${copied === `val:${k.env}` ? 'text-success border-success/40' : 'text-text-muted border-border hover:text-accent hover:border-accent/50'}`}>
                  {copied === `val:${k.env}` ? '✓ Скопировано' : '⧉ Ключ'}
                </button>
              </div>
            ))}
            {allKeys.length === 0 && <p className="text-xs text-text-muted">Не найдено ключей.</p>}
          </div>
        </div>
      ) : (
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-text">
              {activeAgent?.name} · ключи ({activeAgent?.keys.length ?? 0})
            </h3>
            <span className={`text-[11px] px-2 py-0.5 rounded ${activeAgent?.installed ? 'text-success bg-success/15' : 'text-text-muted bg-bg-elevated'}`}>
              {activeAgent?.installed ? '● установлен' : '○ не установлен'}
            </span>
          </div>
          <p className="text-[11px] text-text-muted mb-3">
            Ключи применяются при запуске агента «{activeAgent?.name}» — можно использовать любого провайдера, которого поддерживает сам агент.
          </p>
          <div className="space-y-2">
            {(activeAgent?.keys || []).map(k => renderKey(k, activeAgent.id))}
            {(activeAgent?.keys || []).length === 0 && <p className="text-xs text-text-muted">Похоже, у этого агента нет привязанных ключей.</p>}
          </div>
        </div>
      )}

      {/* Статус последней синхронизации */}
      {lastSync && (
        <div className="glass rounded-xl p-4">
          <h3 className="font-semibold text-text mb-2">Результат: {lastSync.agentId} · {lastSync.keyVar}</h3>
          {lastSync.results ? (
            <div className="space-y-1.5">
              {lastSync.results.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  <span className={r.ok ? 'text-success' : 'text-danger'}>{r.ok ? '✓' : '✕'} {r.id}</span>
                  <span className="text-text-muted text-xs">{r.ok ? (r.detail || '') : r.reason}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">{lastSync.msg}</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-danger">Ошибка: {error}</p>}
    </div>
  )
}