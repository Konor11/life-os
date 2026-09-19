import { useState, useEffect } from 'react'

const API = '/api'

export function KeysView() {
  const [keys, setKeys] = useState([])
  const [harnesses, setHarnesses] = useState([])
  const [busy, setBusy] = useState(null)  // keyVar being synced
  const [lastSync, setLastSync] = useState(null)  // {keyVar, results}
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)

  const load = async () => {
    try {
      setKeys((await (await fetch(`${API}/keys`)).json()).keys || [])
      setHarnesses((await (await fetch(`${API}/harnesses`)).json()).harnesses || [])
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const sync = async (keyVar) => {
    setBusy(keyVar); setError(null)
    try {
      const r = await fetch(`${API}/keys/sync`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ keyVar }) })
      const d = await r.json()
      setLastSync({ keyVar, results: d.results || [] })
    } catch (e) { setError(e.message) }
    setBusy(null)
  }

  const copyName = async (v) => {
    try { await navigator.clipboard.writeText(v); setCopied(v); setTimeout(() => setCopied(null), 1200) } catch {}
  }

  const installedHarnessNames = harnesses.filter(h => h.installed).map(h => h.name).join(', ') || '—'

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <div>
        <h1 className="text-2xl font-bold text-text">Ключи</h1>
        <p className="text-text-muted">
          Список API-ключей провайдеров. Кнопка <b>«Синхронизировать»</b> распространяет ключ на все установленные harness
          (сейчас: <b>{installedHarnessNames}</b>; добавишь Pi или DeepSeek harness — они подхватятся автоматически).
        </p>
      </div>

      {/* Установленные harness */}
      <div className="glass rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-text">Установленные harness</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {harnesses.map(h => (
            <div key={h.id} className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 ${h.installed ? 'bg-success/15' : 'bg-bg-elevated'}`}
              style={{ color: h.installed ? '#10b981' : '#667085', borderColor: 'transparent' }}>
              <span className={`w-2 h-2 rounded-full ${h.installed ? 'bg-success' : 'bg-text-muted/30'}`} />
              {h.name}
              {h.installed ? '' : ' · не установлен'}
            </div>
          ))}
        </div>
      </div>

      {/* Список ключей */}
      <div className="glass rounded-xl p-4">
        <h3 className="font-semibold text-text mb-1">Ключи провайдеров ({keys.length})</h3>
        <p className="text-[11px] text-text-muted mb-3">Синхронизация присваивает этот ключ всем установленным harness (значения ключей не показываются — только маска).</p>
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.env} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-black/40 border border-border">
              <div className="flex flex-col">
                <button onClick={() => copyName(k.env)} title="Скопировать название"
                  className={`text-sm font-mono text-left ${copied === k.env ? 'text-success' : 'text-text'}`}>
                  {k.env} {copied === k.env ? '✓' : ''}
                </button>
                <span className="text-[11px] text-text-muted">{k.length} символов · {k.masked}</span>
              </div>
              <button onClick={() => sync(k.env)} disabled={busy}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${busy === k.env ? 'opacity-60' : ''}`}
                style={{ background: busy === k.env ? '#444' : 'linear-gradient(180deg,#6a7bff,#5865f2)', color: '#fff' }}>
                {busy === k.env ? 'Синхронизирую...' : '🔄 Синхронизировать'}
              </button>
            </div>
          ))}
          {keys.length === 0 && <p className="text-xs text-text-muted">Не найдено ключей.</p>}
        </div>
      </div>

      {/* Статус последней синхронизации */}
      {lastSync && (
        <div className="glass rounded-xl p-4">
          <h3 className="font-semibold text-text mb-2">Результат: {lastSync.keyVar}</h3>
          <div className="space-y-1.5">
            {lastSync.results.map(r => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <span className={r.ok ? 'text-success' : 'text-danger'}>{r.ok ? '✓' : '✕'} {r.id}</span>
                <span className="text-text-muted text-xs">{r.ok ? (r.detail || '') : r.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">Ошибка: {error}</p>}
    </div>
  )
}