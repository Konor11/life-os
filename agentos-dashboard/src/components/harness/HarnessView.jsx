import { useState, useEffect } from 'react'
import { Icon } from '../Icons'

const API = '/api'

const PROVIDER_COLOR = {
  'OpenRouter': '#5865f2', 'OpenAI': '#10a37f', 'Anthropic': '#d97757', 'DeepSeek': '#6f5bf2', 'Google': '#ea4335'
}

// One installable row: engines (binaries) and components (systemd services) share it.
function ItemCard({ item, keys, busyId, busyOp, logs, onInstall, onUninstall, onUpdate }) {
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
            {item.updateCmd && (
              <button onClick={() => onUpdate(item.id)} disabled={!!busyId}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 ${busy && busyOp === 'update' ? 'opacity-60' : ''}`}>
                {busy && busyOp === 'update' ? '⏳ Обновление...' : '⬆ Обновить'}
              </button>
            )}
            {item.uninstallCmd && (
              <button onClick={() => onUninstall(item.id)} disabled={!!busyId}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 ${busy && busyOp === 'uninstall' ? 'opacity-60' : ''}`}>
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
  const [updating, setUpdating] = useState(null)
  const [logs, setLogs] = useState({})
  const [keys, setKeys] = useState([])
  // OpenCode install options: mode (tui/web/both) + domain for the web UI
  const [installOpts, setInstallOpts] = useState(null) // { id, name, mode, domain }

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

  const allItems = [...components, ...harnesses]

  // poll the active op (install / uninstall / update) while running
  const busyId = installing || uninstalling || updating
  const busyOp = updating ? 'update' : uninstalling ? 'uninstall' : 'install'
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
          if (kind === 'install') setInstalling(null)
          else if (kind === 'uninstall') setUninstalling(null)
          else setUpdating(null)
          load()  // re-detect installation state
        }
      } catch {}
    }, 2500)
    return () => clearInterval(timer)
  }, [busyId, busyOp])

  const runInstall = async (id, opts) => {
    try {
      const isComponent = components.some(c => c.id === id)
      const ep = isComponent ? 'components' : 'harness'
      await fetch(`${API}/${ep}/install`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...opts }) })
      setInstalling(id); setLogs(prev => ({ ...prev, [id]: '⏳ установка запущена...' }))
    } catch (e) { setError(e.message) }
  }

  const install = async (id) => {
    const item = allItems.find(x => x.id === id)
    if (item?.needsInstallOptions) {
      setInstallOpts({ id, name: item.name, mode: 'both', domain: 'oc.dktunnel.xyz' })
      return
    }
    runInstall(id)
  }

  const confirmInstallOpts = async () => {
    if (!installOpts) return
    const { id, mode, domain } = installOpts
    setInstallOpts(null)
    await runInstall(id, { mode, domain })
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

  const update = async (id) => {
    try {
      await fetch(`${API}/harness/update`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setUpdating(id); setLogs(prev => ({ ...prev, [id]: '⏳ обновление запущено...' }))
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
              logs={logs} onInstall={install} onUninstall={uninstall} onUpdate={update} />
          ))}
        </>
      )}

      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
        <Icon name="Wrench" size={14} /> Движки (агенты)
      </h2>
      {harnesses.map(h => (
        <ItemCard key={h.id} item={h} keys={keys} busyId={busyId} busyOp={busyOp}
          logs={logs} onInstall={install} onUninstall={uninstall} onUpdate={update} />
      ))}

      {error && <p className="text-sm text-danger">Ошибка: {error}</p>}

      {/* Install options modal (OpenCode: TUI / Web / both + domain) */}
      {installOpts && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setInstallOpts(null)}>
          <div className="glass rounded-xl border border-border p-5 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-text">Установка {installOpts.name}</h3>
            <div className="space-y-2">
              <p className="text-sm text-text-muted">Что установить:</p>
              {[
                { v: 'tui', label: '💻 Только TUI', hint: 'терминальный интерфейс' },
                { v: 'web', label: '🌐 Только Web UI', hint: 'веб-интерфейс на своём домене' },
                { v: 'both', label: '💻🌐 Всё вместе', hint: 'TUI + Web UI' },
              ].map(o => (
                <button key={o.v} onClick={() => setInstallOpts(p => ({ ...p, mode: o.v }))}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${installOpts.mode === o.v ? 'border-accent bg-accent/10' : 'border-border hover:bg-bg-elevated'}`}>
                  <div className="text-sm font-medium text-text">{o.label}</div>
                  <div className="text-xs text-text-muted">{o.hint}</div>
                </button>
              ))}
            </div>
            {installOpts.mode !== 'tui' && (
              <div>
                <label className="text-sm text-text-muted block mb-1">Домен для Web UI:</label>
                <input value={installOpts.domain}
                  onChange={e => setInstallOpts(p => ({ ...p, domain: e.target.value }))}
                  placeholder="oc.dktunnel.xyz"
                  className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent" />
                <p className="text-xs text-text-muted mt-1">Добавится в Caddy → reverse_proxy на opencode (:4096).</p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setInstallOpts(null)}
                className="px-4 py-2 rounded-lg text-sm border border-border text-text-muted hover:text-text">Отмена</button>
              <button onClick={confirmInstallOpts}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-accent hover:opacity-90"
                disabled={installOpts.mode !== 'tui' && !installOpts.domain.trim()}>
                Установить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
