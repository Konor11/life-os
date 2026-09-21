import { useState } from 'react'
import { Icon } from './Icons'

// Coder — self-hosted cloud development platform (coder/coder): VS Code in browser,
// terminal, workspaces. Embedded from its own subdomain, same pattern as n8n.
// Referer os.dktunnel.xyz passes Caddy's gate; Caddy strips X-Frame-Options/CSP so
// the UI can be framed. Workspace sub-apps proxy through the same origin.
export function CoderView() {
  const [reloadKey, setReloadKey] = useState(0)
  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 9rem)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-bg-elevated/40 border border-border mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center"><Icon name="Terminal" size={18} className="text-accent" /></div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text text-sm">Coder Workspaces</h3>
            <p className="text-xs text-text-muted truncate">Облачная разработка: VS Code в браузере, терминал, воркспейсы · coder.dktunnel.xyz</p>
          </div>
        </div>
        <button onClick={() => setReloadKey(k => k + 1)} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated flex items-center gap-2 transition-colors">
          <Icon name="RefreshCw" size={14} /> Обновить
        </button>
      </div>
      <iframe
        key={reloadKey}
        src="https://coder.dktunnel.xyz/"
        className="w-full flex-1 rounded-xl border border-border bg-bg-elevated/20"
        style={{ minHeight: 'calc(100vh - 14rem)' }}
        allow="clipboard-read; clipboard-write; camera; microphone; fullscreen"
        referrerPolicy="origin-when-cross-origin"
      />
    </div>
  )
}