import { useState } from 'react'
import { Icon } from './Icons'

// n8n — self-hosted workflow automation, embedded from its own subdomain.
// Referer os.dktunnel.xyz passes Caddy's protection; reload works inside iframe.
export function N8nView() {
  const [reloadKey, setReloadKey] = useState(0)
  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 9rem)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-bg-elevated/40 border border-border mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center"><Icon name="Zap" size={18} className="text-accent" /></div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text text-sm">n8n Workflow Automation</h3>
            <p className="text-xs text-text-muted truncate">Визуальный конструктор автоматно-агентских воркфлоу · n8n.dktunnel.xyz</p>
          </div>
        </div>
        <button onClick={() => setReloadKey(k => k + 1)} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated flex items-center gap-2 transition-colors">
          <Icon name="RefreshCw" size={14} /> Обновить
        </button>
      </div>
      <iframe
        key={reloadKey}
        src="https://n8n.dktunnel.xyz/"
        className="w-full flex-1 rounded-xl border border-border bg-bg-elevated/20"
        style={{ minHeight: 'calc(100vh - 14rem)' }}
        allow="clipboard-read; clipboard-write; camera; microphone"
        referrerPolicy="origin-when-cross-origin"
      />
    </div>
  )
}