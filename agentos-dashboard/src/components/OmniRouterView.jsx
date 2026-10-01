import { useEffect, useState } from 'react'
import { Icon } from './Icons'
import { EmptyState } from './PanelUX'

// OmniRoute — единый ИИ-шлюз: 350+ провайдеров за одним OpenAI-совместимым эндпоинтом.
//
// ПОЧЕМУ ЗДЕСЬ НЕТ iframe. OmniRoute отдаёт на каждый ответ:
//     X-Frame-Options: DENY
//     Content-Security-Policy: ... frame-ancestors 'none'
// Приложение само запрещает показывать себя внутри других страниц, и браузер рисует пустой
// кадр. Это НЕ настройка панели: снять запрет можно только вырезав заголовки на уровне Caddy,
// то есть сознательно отключив защиту шлюза от кликджекинга (в нём ключи от 350+ провайдеров).
// Поэтому по умолчанию шлюз открывается в новой вкладке.

export function OmniRouterView() {
  const [url, setUrl] = useState(null)     // null = выясняем, '' = домен не задан
  const [info, setInfo] = useState(null)   // { running, status, version, providers, error }
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
          .then(j => { if (j) setInfo(j) })
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-bg-elevated/40 border border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
            <Icon name="Route" size={18} className="text-accent" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text text-sm">OmniRoute — единый ИИ-шлюз</h3>
            <p className="text-xs text-text-muted truncate">
              {url ? url.replace('https://', '') : 'домен не задан'}
              {info?.version ? ` · версия ${info.version}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {info && (
            <span className={`text-[11px] px-2 py-1 rounded-lg whitespace-nowrap ${
              info.running ? 'bg-success/15 text-success' : 'bg-bg-elevated text-text-muted'}`}>
              {info.running ? 'работает' : 'не отвечает'}
            </span>
          )}
          <button onClick={() => setShowLog(v => !v)}
            className="px-3 py-2 border border-border rounded-lg hover:bg-bg-elevated flex items-center gap-1.5 transition-colors">
            <Icon name="Activity" size={14} /> Состояние
          </button>
        </div>
      </div>

      {showLog && info && (
        <div className="glass p-3 rounded-xl">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-text">Состояние шлюза</span>
            <span className="text-[11px] text-text-muted">omniroute status</span>
          </div>
          {info.status ? (
            <pre className="text-[11px] text-text-muted whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{info.status}</pre>
          ) : (
            <div className="text-xs text-text-muted">
              {info?.running
                ? 'CLI не ответил — попробуй ещё раз.'
                : 'Служба не запущена. Логи — journalctl -u omniroute.'}
            </div>
          )}
          {info.error && <div className="text-[11px] text-danger mt-1.5">{info.error}</div>}
        </div>
      )}

      {url === '' ? (
        <div className="glass p-4 rounded-xl">
          <EmptyState
            icon="Globe" mascot="idle"
            title="Домен не задан"
            hint="Укажи его в /root/.omniroute-domain и перезапусти компонент — тогда шлюз откроется по ссылке. Без домена он доступен на порту 20128."
          />
        </div>
      ) : (
        <div className="glass p-6 rounded-xl flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center">
            <Icon name="Route" size={26} className="text-accent" />
          </div>
          <div className="text-sm font-medium text-text">
            Шлюз работает, но встроить его в панель нельзя
          </div>
          <p className="text-xs text-text-muted max-w-lg leading-relaxed">
            OmniRoute отдаёт заголовки <code>X-Frame-Options: DENY</code> и{' '}
            <code>frame-ancestors 'none'</code> — приложение запрещает показывать себя внутри
            других страниц. Поэтому здесь не кадр, а ссылка: шлюз открывается в отдельной вкладке.
          </p>
          <a href={url} target="_blank" rel="noreferrer"
            className="px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium flex items-center gap-2">
            <Icon name="ExternalLink" size={15} /> Открыть шлюз
          </a>
          <div className="text-[11px] text-text-muted mt-1 space-y-1 w-full max-w-sm">
            <p>Единый адрес для приложений (OpenAI-совместимый API):</p>
            <code className="px-2 py-1.5 rounded bg-bg-elevated block break-all">
              {(url || '').replace('https://', '')}/v1
            </code>
          </div>
        </div>
      )}
    </div>
  )
}
