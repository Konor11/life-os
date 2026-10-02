import { useEffect, useState } from 'react'
import { Icon } from './Icons'
import { EmptyState } from './PanelUX'

// OmniRoute — единый ИИ-шлюз: 350+ провайдеров за одним OpenAI-совместимым эндпоинтом.
//
// КАДР РАБОТАЕТ, но не сам по себе. OmniRoute отдаёт `X-Frame-Options: DENY` и
// `frame-ancestors 'none'`. Запрет снят на прокси Caddy для домена шлюза:
//   * X-Frame-Options и чужой CSP удаляются на прокси (reverse_proxy -> header_down);
//   * взамен задаётся СВОЙ CSP с `frame-ancestors https://lifeos.dktunnel.xyz`.
// Последнее важно: разрешена вставка ровноLife OS, любой чужой сайт по-прежнему не может
// встроить шлюз (в нём ключи от 350+ провайдеров — защита от кликджекинга не снята).
// Если Caddy перезалить старым конфигом, кадр снова опустеет — это ожидаемо.

export function OmniRouterView() {
  const [url, setUrl] = useState(null)     // null = выясняем, '' = домен не задан
  const [info, setInfo] = useState(null)   // { running, status, version, providers, error }
  const [err, setErr] = useState('')
  const [showLog, setShowLog] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)      // идёт запуск/остановка службы

  // Запуск и остановка службы компонента. Само по себе включение OmniRoute занимает
  // ~590 МБ, поэтому по умолчанию он не поднимается вместе с системой.
  const serviceAction = async () => {
    if (busy) return
    const action = info?.running ? 'stop' : 'start'
    setBusy(true)
    setErr('')
    try {
      const r = await fetch('/api/components/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'omniroute', action }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setErr(j?.error || 'не удалось выполнить действие')
        return
      }
      // Служба поднимается не мгновенно: даём ей секунды и перечитываем состояние.
      setTimeout(() => setReloadKey(k => k + 1), 3000)
    } catch (e) {
      setErr('сервер недоступен')
    } finally {
      setBusy(false)
    }
  }

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
      {/* На узком экране (360px) прошлая версия была нечитаемой: заголовок обрезался до
          «единый ий-шлюз» и налезал на бейдж, кнопки слипались. Теперь блок переносится,
          подпись «единый ИИ-шлюз» живёт только на широких экранах, а фон плотный —
          на полупрозрачном текст терял контраст. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 rounded-lg bg-bg-elevated border border-border">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <Icon name="Route" size={16} className="text-accent" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text text-sm truncate">
              OmniRoute<span className="hidden sm:inline"> — единый ИИ-шлюз</span>
            </h3>
            <p className="text-[11px] text-text-muted truncate">
              {url ? url.replace('https://', '') : 'домен не задан'}
              {info?.version ? ` · ${info.version}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {info && (
            <span className={`text-[11px] px-2 py-1 rounded-lg whitespace-nowrap ${
              info.running ? 'bg-success/15 text-success' : 'bg-bg-card text-text-muted'}`}>
              {info.running ? 'работает' : 'не отвечает'}
            </span>
          )}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" title="Открыть в отдельной вкладке"
              className="p-2 border border-border rounded-lg hover:bg-bg-card flex items-center">
              <Icon name="ExternalLink" size={14} />
            </a>
          )}
          {/* Компонент по требованию: OmniRoute сам по себе занимает ~590 МБ, а нужен
              только когда в него заходят. Поэтому запуск и остановка — руками. */}
          <button
            onClick={serviceAction}
            disabled={busy}
            title={info?.running ? 'Остановить шлюз — освободит память' : 'Запустить шлюз'}
            className={`px-2.5 py-2 border rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
              info?.running ? 'border-border hover:bg-bg-card' : 'border-accent/50 text-accent hover:bg-accent/10'}`}>
            <Icon name={info?.running ? 'Square' : 'Play'} size={14} />
            <span className="hidden sm:inline">{busy ? '…' : info?.running ? 'Остановить' : 'Запустить'}</span>
          </button>
          <button onClick={() => setReloadKey(k => k + 1)} title="Перезагрузить шлюз"
            className="p-2 border border-border rounded-lg hover:bg-bg-card flex items-center">
            <Icon name="RefreshCw" size={14} />
          </button>
          <button onClick={() => setShowLog(v => !v)} title="Состояние шлюза"
            className="p-2 sm:px-3 sm:py-2 border border-border rounded-lg hover:bg-bg-card flex items-center gap-1.5 transition-colors">
            <Icon name="Activity" size={14} /><span className="hidden sm:inline">Состояние</span>
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

      {/* Проверка именно на null: пока домен выясняется, url === null, и условие `url === ''`
          давало false — кадр рендерился с null и приложение падало в ErrorBoundary.
          Сборка это не ловит, ловит только запуск в браузере. */}
      {!url ? (
        <div className="glass p-4 rounded-xl">
          <EmptyState
            icon={url === '' ? 'Globe' : 'Route'} mascot="idle"
            title={url === '' ? 'Домен не задан' : 'Загружаю…'}
            hint={url === ''
              ? 'Укажи его в /root/.omniroute-domain и перезапусти компонент — тогда шлюз откроется здесь. Без домена он доступен на порту 20128.'
              : 'Проверяю состояние компонента.'}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <iframe
            key={reloadKey}
            src={url}
            title="OmniRoute"
            className="w-full rounded-xl border border-border bg-bg"
            style={{ minHeight: '72vh' }}
          />
          <div className="text-[11px] text-text-muted px-1">
            Единый адрес для приложений (OpenAI-совместимый API):{' '}
            <code className="break-all">{url.replace('https://', '')}/v1</code>
          </div>
        </div>
      )}
    </div>
  )
}
