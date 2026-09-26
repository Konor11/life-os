import { useEffect, useState } from 'react'
import { Icon } from './Icons'

// n8n — self-hosted workflow automation, embedded from ITS OWN domain (recorded at install
// time and served by /api/components). A hardcoded subdomain from an older deployment made
// the frame load a foreign host.
export function N8nView() {
  const [reloadKey, setReloadKey] = useState(0)
  const [url, setUrl] = useState(null)   // null = ещё не знаем, '' = домен не задан
  useEffect(() => {
    fetch('/api/components').then(r => r.json()).then(d => {
      const c = (d.components || []).find(x => x.id === 'n8n')
      setUrl(c?.webUrl || '')
    }).catch(() => setUrl(''))
  }, [])
  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100dvh - 9rem)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-bg-elevated/40 border border-border mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center"><Icon name="Zap" size={18} className="text-accent" /></div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text text-sm">n8n Workflow Automation</h3>
            <p className="text-xs text-text-muted truncate">Визуальный конструктор воркфлоу{url ? ` · ${url.replace('https://', '')}` : ''}</p>
          </div>
        </div>
        <button onClick={() => setReloadKey(k => k + 1)} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated flex items-center gap-2 transition-colors">
          <Icon name="RefreshCw" size={14} /> Обновить
        </button>
      </div>
      {url === '' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-sm text-text-muted" style={{ minHeight: 'calc(100dvh - 14rem)' }}>
          <span>Домен n8n не определён.</span>
          <span className="text-xs">Установи n8n из панели — домен подставится автоматически, либо впиши его в <code>/root/.n8n-domain</code>.</span>
        </div>
      ) : url && (
        <iframe
          key={reloadKey}
          src={`${url}/`}
          className="w-full flex-1 rounded-xl border border-border bg-bg-elevated/20"
          style={{ minHeight: 'calc(100dvh - 14rem)' }}
          allow="clipboard-read; clipboard-write; camera; microphone"
          referrerPolicy="origin-when-cross-origin"
        />
      )}
    </div>
  )
}
