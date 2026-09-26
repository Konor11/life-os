import { useEffect, useState } from 'react'
import { Icon } from './Icons'

// Coder — self-hosted cloud development platform (coder/coder): VS Code in browser,
// terminal, workspaces. The frame uses the domain recorded when Coder was installed
// (/api/components), never a baked-in subdomain.
export function CoderView() {
  const [reloadKey, setReloadKey] = useState(0)
  const [url, setUrl] = useState(null)   // null = ещё не знаем, '' = домен не задан
  useEffect(() => {
    fetch('/api/components').then(r => r.json()).then(d => {
      const c = (d.components || []).find(x => x.id === 'coder')
      setUrl(c?.webUrl || '')
    }).catch(() => setUrl(''))
  }, [])
  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100dvh - 9rem)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-bg-elevated/40 border border-border mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center"><Icon name="Terminal" size={18} className="text-accent" /></div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text text-sm">Coder Workspaces</h3>
            <p className="text-xs text-text-muted truncate">Облачная разработка: VS Code в браузере, терминал, воркспейсы{url ? ` · ${url.replace('https://', '')}` : ''}</p>
          </div>
        </div>
        <button onClick={() => setReloadKey(k => k + 1)} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated flex items-center gap-2 transition-colors">
          <Icon name="RefreshCw" size={14} /> Обновить
        </button>
      </div>
      {url === '' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-sm text-text-muted" style={{ minHeight: 'calc(100dvh - 14rem)' }}>
          <span>Домен Coder не определён.</span>
          <span className="text-xs">Установи Coder из панели — домен подставится автоматически, либо впиши его в <code>/root/.coder-domain</code>.</span>
        </div>
      ) : url && (
        <iframe
          key={reloadKey}
          src={`${url}/`}
          className="w-full flex-1 rounded-xl border border-border bg-bg-elevated/20"
          style={{ minHeight: 'calc(100dvh - 14rem)' }}
          allow="clipboard-read; clipboard-write; camera; microphone; fullscreen"
          referrerPolicy="origin-when-cross-origin"
        />
      )}
    </div>
  )
}
