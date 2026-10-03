import { useEffect, useState } from 'react'
import { Icon } from './Icons'

// Экран Vaultwarden. Сделан по образцу OmniRouterView: состояние службы, запуск и
// остановка по кнопке (компонент работает по требованию) и ссылка на само хранилище.
//
// Два предупреждения, которые обязаны быть на виду: хранилище паролей лежит на диске
// сервера, и регистрация после установки остаётся открытой, пока её не выключат.
export function VaultwardenView() {
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    // Именно /api/components: он отдаёт всё нужное разом — installed, running, webUrl,
    // canControl. Маршрута /api/components/vaultwarden/status НЕ СУЩЕСТВУЕТ (я на него
    // сначала сослался, и экран показывал «сервер недоступен» при работающем сервисе),
    // а /api/components/status?id=... не отдаёт webUrl — домен было бы негде взять.
    fetch('/api/components')
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        const c = (j?.components || []).find(x => x.id === 'vaultwarden')
        if (c) setInfo(c)
        else setErr('компонент не найден в списке')
      })
      .catch(() => { if (alive) setErr('сервер недоступен') })
    return () => { alive = false }
  }, [reloadKey])

  // Служба поднимается не мгновенно — после действия даём пару секунд и перечитываем.
  const serviceAction = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/components/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'vaultwarden', action: info?.running ? 'stop' : 'start' }),
      })
      if (!r.ok) { setErr('не удалось выполнить действие'); return }
      setTimeout(() => setReloadKey(k => k + 1), 3000)
    } catch {
      setErr('сервер недоступен')
    } finally {
      setBusy(false)
    }
  }

  // Пока компонент не установлен, webUrl не вычисляется. Тогда показываем «остановлен»
  // и просьбу поставить, а не выдуманное «домен не задан».
  const installed = info?.installed !== false
  const url = info?.webUrl || null

  return (
    <div className="p-4 space-y-3">
      <div className="card-surface rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl grid place-items-center bg-accent/15 text-accent shrink-0">
            <Icon name="Key" size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text text-sm truncate">
              Vaultwarden<span className="hidden sm:inline"> — менеджер паролей</span>
            </h3>
            <p className="text-[11px] text-text-muted truncate">
              {url ? url.replace('https://', '')
                : installed ? 'домен не задан' : 'не установлен — поставь в разделе «Установка»'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <span className={`text-[11px] px-2 py-1 rounded-lg whitespace-nowrap ${
            info?.running ? 'bg-success/15 text-success' : 'bg-bg-card text-text-muted'}`}>
            {info?.running ? 'работает' : 'остановлен'}
          </span>
          <button
            onClick={serviceAction}
            disabled={busy}
            title={info?.running ? 'Остановить' : 'Запустить'}
            className={`px-2.5 py-2 border rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
              info?.running ? 'border-border hover:bg-bg-card' : 'border-accent/50 text-accent hover:bg-accent/10'}`}>
            <Icon name={info?.running ? 'Square' : 'Play'} size={14} />
            <span>{busy ? '…' : info?.running ? 'Остановить' : 'Запустить'}</span>
          </button>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" title="Открыть хранилище"
              className="px-2.5 py-2 border border-border rounded-lg hover:bg-bg-card flex items-center gap-1.5">
              <Icon name="ExternalLink" size={14} /><span>Хранилище</span>
            </a>
          )}
        </div>
      </div>

      {err && <div className="text-xs text-danger px-1">{err}</div>}

      <div className="card-surface rounded-2xl p-4 space-y-2 text-[12px] text-text-muted">
        <div className="text-sm font-medium text-text">Как этим пользоваться</div>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Открой «Хранилище» и зарегистрируй свой аккаунт.</li>
          <li>
            Сразу после этого <b className="text-text">закрой регистрацию</b> — на публичном
            домене иначе заведёт аккаунт кто угодно:
            <code className="block mt-1 text-[11px] px-2 py-1 rounded bg-bg-card overflow-x-auto whitespace-nowrap">
              sed -i 's/^SIGNUPS_ALLOWED=.*/SIGNUPS_ALLOWED=false/' /root/.vaultwarden.env &amp;&amp; systemctl restart vaultwarden
            </code>
          </li>
          <li>
            Админка — <code className="text-[11px]">/admin</code>, токен лежит в
            <code className="text-[11px]"> /root/.vaultwarden-admin-token</code>.
          </li>
          <li>Клиенты Bitwarden подключаются по адресу хранилища — самостоятельный сервер.</li>
        </ol>
      </div>

      <div className="card-surface rounded-2xl p-4 text-[12px] text-text-muted space-y-1">
        <div className="text-sm font-medium text-text">Где что лежит</div>
        <div>хранилище и ключи: <code className="text-[11px]">/root/vaultwarden-data</code> (права 700)</div>
        <div>настройки: <code className="text-[11px]">/root/.vaultwarden.env</code></div>
        <div className="text-[11px] opacity-80">
          Удаление компонента НЕ трогает хранилище: пароли и ключи останутся на месте.
        </div>
      </div>
    </div>
  )
}