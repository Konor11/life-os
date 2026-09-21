import { useState, useEffect } from 'react'
import { Icon } from '../Icons'
import { ENGINES, WEB_ENGINES, getEngineView, setEngineView } from './ChatPanel'

const API = '/api'

export function SettingsPanel() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  // per-engine default view (re-read whenever the panel mounts)
  const [engineViews, setEngineViews] = useState(() => {
    const m = {}
    for (const e of ENGINES) m[e.id] = getEngineView(e.id, 'web')
    return m
  })

  useEffect(() => {
    fetch(`${API}/status`).then(r => r.json()).then(d => { setStatus(d); setLoading(false) })
      .catch(e => { setStatus({ error: e.message }); setLoading(false) })
  }, [])

  const Row = ({ label, value, mono }) => (
    <div className="flex items-center justify-between py-2 border-b border-border/60">
      <span className="text-text-muted text-sm">{label}</span>
      <span className={`text-text text-sm ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-bg-card rounded-xl overflow-hidden border border-border text-sm" style={{ minHeight: '320px' }}>
      <div className="px-3 py-2 bg-bg-elevated border-b border-border">
        <span className="text-xs text-text-muted">Настройки системы</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="text-text-muted text-xs text-center py-8">Загрузка...</div>
        ) : status?.error ? (
          <div className="text-danger text-sm">{status.error}</div>
        ) : (
          <div>
            <h3 className="text-text font-semibold mb-2 flex items-center gap-2"><Icon name="Desktop" size={16} className="text-accent" /> Сервер</h3>
            <Row label="Хост" value={status.host} mono />
            <Row label="Платформа" value={`${status.platform}/${status.arch}`} mono />
            <Row label="Uptime" value={`${Math.round(status.uptime)}s`} />
            <Row label="CPU load" value={status.cpuLoad?.map(x=>x.toFixed(2)).join(' / ')} mono />
            <Row label="RAM (RSS)" value={`${(status.mem?.rss/1024/1024).toFixed(0)} MB`} mono />
            <Row label="OpenRouter" value={status.openrouter} mono />

            <h3 className="text-text font-semibold mt-4 mb-2 flex items-center gap-2"><Icon name="Brain" size={16} className="text-accent" /> Агенты (профили)</h3>
            <div className="flex flex-wrap gap-2 py-2">
              {status.profiles?.map(p => (
                <span key={p} className="px-2 py-1 bg-bg-elevated rounded text-xs text-text-muted">{p}</span>
              ))}
            </div>

            <h3 className="text-text font-semibold mt-4 mb-2 flex items-center gap-2"><Icon name="Terminal" size={16} className="text-accent" /> Движки · открывать по умолчанию</h3>
            <div className="flex flex-col gap-2 py-1">
              {ENGINES.map(e => (
                <div key={e.id} className="flex items-center justify-between py-1.5 px-2 bg-bg-elevated rounded-md">
                  <span className="flex items-center gap-2 text-sm text-text">
                    {e.name}
                    {!WEB_ENGINES.has(e.id) && <span className="text-[10px] text-text-muted">только TUI</span>}
                  </span>
                  {WEB_ENGINES.has(e.id) ? (
                    <span className="flex items-center gap-2">
                      <button onClick={() => { setEngineView(e.id, 'tui'); setEngineViews({ ...engineViews, [e.id]: 'tui' }) }}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${engineViews[e.id] === 'tui' ? 'bg-accent text-white' : 'bg-bg-card text-text-muted hover:text-text'}`}>
                        💻 TUI
                      </button>
                      <button onClick={() => { setEngineView(e.id, 'web'); setEngineViews({ ...engineViews, [e.id]: 'web' }) }}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${engineViews[e.id] === 'web' ? 'bg-accent text-white' : 'bg-bg-card text-text-muted hover:text-text'}`}>
                        🌐 Web
                      </button>
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </div>
              ))}
            </div>

            <h3 className="text-text font-semibold mt-4 mb-2 flex items-center gap-2"><Icon name="Folder" size={16} className="text-accent" /> Данные</h3>
            <Row label="Data dir" value={status.dataDir} mono />
            <Row label="Sandbox root" value="/root, /tmp, /home" mono />

            <div className="mt-4 p-3 bg-bg-elevated rounded-lg text-xs text-text-muted">
              <p className="text-text-muted">Терминал и файл-менеджер работают в рамках песочницы {'('}{'/root'}, {'/tmp'}, {'/home'}{')'} и защищены от опасных команд.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}