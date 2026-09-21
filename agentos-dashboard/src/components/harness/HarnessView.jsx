import { useState, useEffect } from 'react'
import { Icon } from '../Icons'

const API = '/api'

const PROVIDER_COLOR = {
  'OpenRouter': '#5865f2', 'OpenAI': '#10a37f', 'Anthropic': '#d97757', 'DeepSeek': '#6f5bf2', 'Google': '#ea4335'
}

// One installable row: engines (binaries) and components (systemd services) share it.
function ItemCard({ item, keys, busyId, busyOp, logs, onInstall, onUninstall }) {
  const missingKey = item.installed && item.key && !keys.some(k => k.env === item.key)
  const busy = busyId === item.id
  return (
    <div className="glass rounded-xl p-4 border"
      style={{ borderColor: item.installed ? 'rgb(var(--cx-success) / 0.35)' : 'rgb(var(--cx-warning) / 0.35)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.installed ? 'bg-success' : 'bg-warning'}`} />
          <h3 className="text-lg font-semibold text-text truncate">{item.name}</h3>
          {item.provider && item.provider !== '—' && (
            <span className="px-2 py-0.5 rounded-full text-[11px] shrink-0"
              style={{ background: `${PROVIDER_COLOR[item.provider] || '#5865f2'}22` }}>
              <span className="text-text">{item.provider}</span>
            </span>
          )}
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 ${item.installed ? 'text-success bg-success/15' : 'text-warning bg-warning/15'}`}>
          {item.installed ? '✓ установлен' : 'не установлен'}
        </span>
      </div>
      <p className="text-sm text-text-muted mt-1.5">{item.desc}</p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {item.installed ? (
          <>
            <span className="px-2 py-1 rounded text-xs bg-bg-elevated border border-border text-text-muted">готов к работе</span>
            {missingKey && (
              <span className="px-2 py-1 rounded text-xs bg-danger/15 border border-border text-danger">
                ⚠ нет ключа {item.key} — добавь в разделе «Ключи»
              </span>
            )}
            {item.uninstallCmd && (
              <button onClick={() => onUninstall(item.id)} disabled={!!busyId}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 ${busy ? 'opacity-60' : ''}`}>
                {busy && busyOp === 'uninstall' ? '⏳ Удаление...' : '🗑 Удалить'}
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => onInstall(item.id)} disabled={!!busyId}
              className={`px-4 py-2 rounded-lg font-medium text-sm text-white bg-accent hover:opacity-90 transition-opacity ${busy ? 'opacity-60' : ''}`}>
              {busy && busyOp === 'install' ? '⏳ Устанавливается...' : `⬇ Установить ${item.name}`}
            </button>
            {item.installCmd && (
              <code className="px-2 py-1 rounded text-[11px] bg-bg-elevated border border-border text-text-muted font-mono break-all max-w-full">{item.installCmd}</code>
            )}
            {item.key && <span className="text-[11px] text-text-muted">требуется {item.key}</span>}
          </>
        )}
      </div>
      {busy && logs[item.id] && (
        <pre className="mt-2 bg-bg-elevated border border-border rounded-lg p-2 overflow-auto max-h-[140px] text-[11px] text-text whitespace-pre-wrap break-words">{logs[item.id]}</pre>
      )}
    </div>
  )
}

export function HarnessView() {
  const [harnesses, setHarnesses] = useState([])
  const [components, setComponents] = useState([])
  const [error, setError] = useState(null)
  const [installing, setInstalling] = useState(null)
  const [uninstalling, setUninstalling] = useState(null)
  const [logs, setLogs] = useState({})
  const [keys, setKeys] = useState([])

  const load = async () => {
    try {
      const [h, k, c] = await Promise.all([
        fetch(`${API}/harnesses`).then(r => r.json()),
        fetch(`${API}/keys`).then(r => r.json()),
        fetch(`${API}/components`).then(r => r.json()).catch(() => ({ components: [] })),
      ])
      setHarnesses(h.harnesses || [])
      setKeys(k.keys || [])
      setComponents(c.components || [])
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  // poll active op (install or uninstall) while running
  const busyId = installing || uninstalling
  const busyOp = uninstalling ? 'uninstall' : 'install'
  useEffect(() => {
    if (!busyId) return
    const kind = busyOp
    const timer = setInterval(async () => {
      try {
        // components and harnesses have separate status endpoints; probe both
        let d = await (await fetch(`${API}/components/${kind}/status?id=${busyId}`)).json().catch(() => null)
        if (!d || d.state === 'none') {
          d = await (await fetch(`${API}/harness/${kind}/status?id=${busyId}`)).json()
        }
        if (d?.log) setLogs(prev => ({ ...prev, [busyId]: d.log }))
        if (d?.state === 'done' || d?.state === 'error') {
          if (kind === 'install') setInstalling(null); else setUninstalling(null)
          load()  // re-detect installation state
        }
      } catch {}
    }, 2500)
    return () => clearInterval(timer)
  }, [busyId, busyOp])

  const install = async (id) => {
    try {
      const isComponent = components.some(c => c.id === id)
      const ep = isComponent ? 'components' : 'harness'
      await fetch(`${API}/${ep}/install`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setInstalling(id); setLogs(prev => ({ ...prev, [id]: '⏳ установка запущена...' }))
    } catch (e) { setError(e.message) }
  }

  const uninstall = async (id) => {
    try {
      const isComponent = components.some(c => c.id === id)
      const ep = isComponent ? 'components' : 'harness'
      await fetch(`${API}/${ep}/uninstall`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setUninstalling(id); setLogs(prev => ({ ...prev, [id]: '⏳ удаление запущено...' }))
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text">Установка компонентов</h1>
        <p className="text-text-muted mt-1">Компоненты и движки ставятся одной кнопкой. Вкладки установленных компонентов (n8n, Coder) появляются в меню автоматически.</p>
      </div>

      {components.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
            <Icon name="Boxes" size={14} /> Компоненты
          </h2>
          {components.map(c => (
            <ItemCard key={c.id} item={c} keys={keys} busyId={busyId} busyOp={busyOp}
              logs={logs} onInstall={install} onUninstall={uninstall} />
          ))}
        </>
      )}

      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
        <Icon name="Wrench" size={14} /> Движки (агенты)
      </h2>
      {harnesses.map(h => (
        <ItemCard key={h.id} item={h} keys={keys} busyId={busyId} busyOp={busyOp}
          logs={logs} onInstall={install} onUninstall={uninstall} />
      ))}

      {error && <p className="text-sm text-danger">Ошибка: {error}</p>}
    </div>
  )
}
