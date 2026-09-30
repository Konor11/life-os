import { useEffect, useState } from 'react'
import { Icon } from './Icons'
import { EmptyState } from './PanelUX'

// OmniRoute — единый ИИ-шлюз: 350+ провайдеров за одним OpenAI-совместимый эндпоинтом.
//
// Экран встроен из СОБСТВЕННОГО домена компонента (записывается при установке и отдаётся
// /api/components), как и n8n: жёстко прописанный поддомен однажды увёл бы фрейм на чужой хост.
//
// Отдельная ценность здесь — блок состояния: OmniRoute умеет рассказать о себе без запуска
// сервера (`omniroute status`, `omniroute doctor`). Это честнее, чем просто «страница грузится /
// не грузится»: видно версию, базу и подключённые провайдеры.

export function OmniRouterView() {
  const [reloadKey, setReloadKey] = useState(0)
  const [url, setUrl] = useState(null)     // null = ещё выясняем, '' = домен не задан
  const [info, setInfo] = useState(null)   // { installed, running, version, status, providers }
  const [err, setErr] = useState('')
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    fetch('/api/components', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const c = (d.components || []).find(x => x.id === 'omniroute')
        setUrl(c?.webUrl || '')
        if (!c?.installed) { setErr('not-installed'); return }
        fetch('/api/components/status?id=omniroute', { cache: 'no-store' })
          .then(r => r.ok ? r.json() : null)
          .then(j => alive(j) && setInfo(j))
          .catch(() => {})
      })
      .catch(() => setUrl(''))
  }, [])

  if (err === 'not-installed') {
    return (
      <div className="glass p-4 rounded-xl">
        <EmptyState
          icon="Route" mascot="idle"
          title="OmniRoute не установлен"
          hint="Поставь его в разделе «Установка компонентов»: поднимется сервис на порту 20128, плюс Node 22 рядом с системным — он нужен именно этой версии. Установка тяжёлая, около 520 МБ."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100dvh - 9rem)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-bg-elevated/40 border border-border mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
            <Icon name="Route" size={18} className="text-accent" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text text-sm">OmniRoute — единый ИИ-шлюз</h3>
            <p className="text-xs text-text-muted truncate">
              {url ? url.replace('https://', '') : 'домен не задан'}
              {info?.version ? ` · версия ${info.version}` : ''}
              {info?.providers ? ` · провайдеров: ${info.providers}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {info && (
            <span className={`text-[11px] px-2 py-1 rounded-lg ${
              info.running ? 'bg-success/15 text-success' : 'bg-bg-elevated text-text-muted'}`}>
              {info.running ? 'работает' : 'не отвечает'}
            </span>
          )}
          <button onClick={() => setShowLog(v => !v)}
            className="px-3 py-2 border border-border rounded-lg hover:bg-bg-elevated flex items-center gap-1.5 transition-colors">
            <Icon name="Activity" size={14} /> Состояние
          </button>
          <button onClick={() => setReloadKey(k => k + 1)}
            className="px-3 py-2 border border-border rounded-lg hover:bg-bg-elevated flex items-center gap-1.5 transition-colors">
            <Icon name="RefreshCw" size={14} /> Обновить
          </button>
        </div>
      </div>

      {showLog && info && (
        <div className="glass p-3 rounded-xl mb-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-text">Состояние шлюза</span>
            <span className="text-[11px] text-text-muted">omniroute status / doctor</span>
          </div>
          {info.status ? (
            <pre className="text-[11px] text-text-muted whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{info.status}</pre>
          ) : (
            <div className="text-xs text-text-muted">
              {info?.running
                ? 'CLI не ответил — попробуй «Состояние» ещё раз или открой журнал службы.'
                : 'Служба не запущена: состояние появится после старта. Логи — journalctl -u omniroute.'}
            </div>
          )}
          {info.error && <div className="text-[11px] text-danger mt-1.5">{info.error}</div>}
        </div>
      )}

      {url === '' ? (
        <div className="glass p-4 rounded-xl flex-1">
          <EmptyState
            icon="Globe" mascot="idle"
            title="Домен не задан"
            hint="Укажи его в /root/.omniroute-domain и перезапусти компонент — тогда панель откроется здесь. Без домена шлюз работает на порту 20128."
          />
        </div>
      ) : (
        <iframe
          key={reloadKey}
          src={url}
          title="OmniRoute"
          className="flex-1 w-full rounded-xl border border-border bg-bg"
          style={{ minHeight: '70vh' }}
        />
      )}
    </div>
  )
}

// Мелкая защита от гонки: ответ мог прийти после размонтирования.
function alive(j) { return !!j }
