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
  const [signups, setSignups] = useState(null)   // true — регистрация открыта
  const [signupsBusy, setSignupsBusy] = useState(false)

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

  useEffect(() => {
    let alive = true
    fetch('/api/components/vaultwarden/signups')
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (alive && j) setSignups(j.enabled) })
      .catch(() => {})
    return () => { alive = false }
  }, [reloadKey])

  // Закрыть регистрацию после регистрации своего аккаунта обязательно: на публичном
  // домене иначе заводит аккаунт кто угодно.
  const toggleSignups = async () => {
    if (signupsBusy || signups === null) return
    const next = !signups
    if (next) {
      const ok = window.confirm('Открыть регистрацию? На публичном домене сможет завести аккаунт кто угодно.')
      if (!ok) return
    }
    setSignupsBusy(true)
    try {
      const r = await fetch('/api/components/vaultwarden/signups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j?.error || 'не удалось переключить'); return }
      setSignups(next)
      setReloadKey(k => k + 1)
    } catch {
      setErr('сервер недоступен')
    } finally {
      setSignupsBusy(false)
    }
  }

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

        {/* Регистрация — одной кнопкой. Пока она открыта, на публичном домене заведёт
            аккаунт кто угодно; после регистрации своего её надо закрыть. */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
          <span className={`text-[11px] px-2 py-1 rounded-lg ${
            signups ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
            {signups === null ? 'неизвестно' : signups ? 'регистрация открыта' : 'регистрация закрыта'}
          </span>
          <button
            onClick={toggleSignups}
            disabled={signupsBusy || signups === null}
            title={signups ? 'Закрыть регистрацию' : 'Открыть регистрацию'}
            className="px-2.5 py-1.5 border border-border rounded-lg text-[12px] hover:bg-bg-card disabled:opacity-50">
            {signupsBusy ? 'Переключаю…' : signups ? 'Закрыть регистрацию' : 'Открыть регистрацию'}
          </button>
        </div>
      </div>

      {err && <div className="text-xs text-danger px-1">{err}</div>}

      <div className="card-surface rounded-2xl p-4 space-y-2 text-[12px] text-text-muted">
        <div className="text-sm font-medium text-text">Как этим пользоваться</div>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Открой «Хранилище» и зарегистрируй свой аккаунт.</li>
          <li>
            Потом нажми <b className="text-text">«Закрыть регистрацию»</b> — на публичном домене
            иначе заведёт аккаунт кто угодно.
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