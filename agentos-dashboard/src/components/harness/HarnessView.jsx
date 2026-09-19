import { useState, useEffect } from 'react'

const API = '/api'

const PROVIDER_COLOR = {
  'OpenRouter': '#5865f2', 'OpenAI': '#10a37f', 'Anthropic': '#d97757', 'DeepSeek': '#6f5bf2', 'Google': '#ea4335'
}

// Соответствие агент → ключ-подсказка для синхронизации
function defaultKeyFor(provider) {
  switch (provider) {
    case 'OpenAI': return 'OPENAI_API_KEY'
    case 'Anthropic': return 'ANTHROPIC_API_KEY'
    case 'DeepSeek': return 'DEEPSEEK_API_KEY'
    default: return 'OPENROUTER_API_KEY'
  }
}

export function HarnessView() {
  const [harnesses, setHarnesses] = useState([])
  const [error, setError] = useState(null)
  const [installing, setInstalling] = useState(null)  // id
  const [uninstalling, setUninstalling] = useState(null)  // id
  const [logs, setLogs] = useState({})  // id -> text
  const [keys, setKeys] = useState([])  // for "sync key after install" quick hint

  const load = async () => {
    try {
      const d = await (await fetch(`${API}/harnesses`)).json()
      setHarnesses(d.harnesses || [])
      const k = await (await fetch(`${API}/keys`)).json()
      setKeys(k.keys || [])
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  // poll active op (install or uninstall) status while running
  useEffect(() => {
    if (!installing && !uninstalling) return
    const op = installing ? 'install' : 'uninstall'
    const id = installing || uninstalling
    const timer = setInterval(async () => {
      try {
        const d = await (await fetch(`${API}/harness/${op}/status?id=${id}`)).json()
        if (d.log) setLogs(prev => ({ ...prev, [id]: d.log }))
        if (d.state === 'done' || d.state === 'error') {
          if (op === 'install') setInstalling(null); else setUninstalling(null)
          load()  // re-detect installation (sets installed false after uninstall)
        }
      } catch {}
    }, 2500)
    return () => clearInterval(timer)
  }, [installing, uninstalling])

  const install = async (id) => {
    try {
      await fetch(`${API}/harness/install`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ id }) })
      setInstalling(id); setLogs(prev => ({ ...prev, [id]: '⏳ установка запущена...' }))
    } catch (e) { setError(e.message) }
  }

  const uninstall = async (id) => {
    try {
      await fetch(`${API}/harness/uninstall`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ id }) })
      setUninstalling(id); setLogs(prev => ({ ...prev, [id]: '⏳ удаление запущено...' }))
    } catch (e) { setError(e.message) }
  }

  const hasKey = (keyVar) => keys.some(k => k.env === keyVar)
  const keyColor = (k) => PROVIDER_COLOR[k] || '#5865f2'
  const busyId = installing || uninstalling
  const busyOp = uninstalling ? 'uninstall' : installing ? 'install' : null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text">Агенты (Harness)</h1>
        <p className="text-text-muted">Установленные агент-харнессы. Для каждого проверяется наличие в системе; если нет — можно установить одной кнопкой.</p>
      </div>

      {harnesses.map(h => (
        <div key={h.id} className="glass rounded-xl p-4 border"
          style={{ borderColor: h.installed ? 'rgba(16,185,129,0.35)' : 'rgba(139,92,246,0.35)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${h.installed ? 'bg-success' : 'bg-warning'}`} />
              <h3 className="text-lg font-semibold text-text">{h.name}</h3>
              <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: `${keyColor(h.provider)}22` }}>
                <span className="text-[11px] text-text">{h.provider}</span>
              </span>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${h.installed ? 'text-success bg-success/15' : 'text-warning bg-warning/15'}`}>
              {h.installed ? '✓ установлен' : 'не установлен'}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1.5">{h.desc}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {h.installed ? (
              <>
                <span className="px-2 py-1 rounded text-xs bg-bg-elevated border border-border text-text-muted font-mono">готов к работе</span>
                {h.key && !hasKey(h.key) && (
                  <span className="px-2 py-1 rounded text-xs bg-danger/15 border border-border text-danger">
                    ⚠ нет ключа {h.key} — добавь в разделе «Ключи»
                  </span>
                )}
                {h.uninstallCmd && (
                  <button onClick={() => uninstall(h.id)} disabled={busyId}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white ${busyId === h.id ? 'opacity-60' : ''}`}
                    style={{ background: busyOp === 'uninstall' && busyId === h.id ? '#7a7a7a' : 'linear-gradient(180deg,#f06,#d61111)' }}>
                    {busyOp === 'uninstall' && busyId === h.id ? '⏳ Удаление...' : '🗑 Удалить'}
                  </button>
                )}
              </>
            ) : (
              <>
                <button onClick={() => install(h.id)} disabled={busyId}
                  className={`px-4 py-2 rounded-lg font-medium text-white ${busyId === h.id ? 'opacity-60' : ''}`}
                  style={{ background: 'linear-gradient(180deg,#7c5cff,#6b46f5)' }}>
                  {busyOp === 'install' && busyId === h.id ? '⏳ Устанавливается...' : `⬇ Установить ${h.name}`}
                </button>
                <code className="px-2 py-1 rounded text-[11px] bg-black/50 border border-border text-text-muted font-mono">{h.installCmd}</code>
                {h.key && <span className="text-[11px] text-text-muted">требуется {h.key}</span>}
              </>
            )}
          </div>
          {busyId === h.id && logs[h.id] && (
            <pre className="mt-2 bg-black/70 rounded-lg p-2 overflow-auto max-h-[140px] text-[11px] text-text whitespace-pre-wrap break-words">{logs[h.id]}</pre>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-danger">Ошибка: {error}</p>}
    </div>
  )
}