import { useEffect, useState } from 'react'
import { Mascot } from './Mascot'

// Окно входа Life OS. Показано, пока вход не выполнен; если пароль ещё не задан — это форма
// первоначальной настройки, где админ сам придумывает логин и пароль.
//
// Реализация: логин/пароль проверяет бэкенд (/api/auth/login или /api/auth/setup), пароль он
// хранит только scrypt-хешем, браузер получает подписанную HttpOnly-куку — в JS пароля нет.
//
// Оформление — на классах темы панели (bg-bg-card / border-border / text-text-muted / accent),
// поэтому окно одинаково аккуратно в светлой и тёмной теме.

export function LoginScreen({ onAuthenticated }) {
  const [needsSetup, setNeedsSetup] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/auth/status', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (alive) { setNeedsSetup(!!(j && j.needsSetup)); setChecked(true) } })
      .catch(() => { if (alive) setChecked(true) })
    return () => { alive = false }
  }, [])

  // Подсказка про Caps Lock: на телефоне это частая причина «ввожу, а не входит».
  const onKey = (e) => setCapsOn(!!(e.getModifierState && e.getModifierState('CapsLock')))

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!login.trim()) return setErr('введите логин')
    if (password.length < 8) return setErr('пароль короче 8 символов')
    if (needsSetup && password !== confirm) return setErr('пароли не совпадают')
    setBusy(true)
    try {
      const url = needsSetup ? '/api/auth/setup' : '/api/auth/login'
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setErr(j.error || 'не удалось войти'); return }
      onAuthenticated && onAuthenticated(j.login || login.trim())
    } catch (e2) {
      setErr(String(e2?.message || e2))
    } finally {
      setBusy(false)
    }
  }

  const skip = () => {
    // Флаг нужен, чтобы экран не возвращался при каждой перезагрузке; когда пароль появится,
    // условие в App перестаёт его учитывать.
    try { localStorage.setItem('lifeos.auth.setupSkipped', '1') } catch {}
    onAuthenticated && onAuthenticated(null)
  }

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-sm text-text-muted">Проверяем доступ…</div>
      </div>
    )
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-lg bg-bg border border-border text-text text-sm ' +
    'placeholder:text-text-muted/70 outline-none transition-colors focus:border-accent ' +
    'focus:ring-2 focus:ring-accent/20 disabled:opacity-60'

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-[400px] relative">
        {/* мягкое пятно за карточкой — глубина без градиентов в интерфейсе */}
        <div className="absolute -inset-6 rounded-[28px] bg-accent/5 blur-2xl pointer-events-none" aria-hidden="true" />

        <div className="relative rounded-2xl bg-bg-card border border-border shadow-card-lg p-7">
          <div className="flex items-center gap-3">
            <Mascot size={40} className="text-accent" title="Life OS" />
            <div>
              <h1 className="text-base font-semibold text-text leading-tight">Life OS</h1>
              <p className="text-[11px] text-text-muted leading-tight">
                {needsSetup ? 'первоначальная настройка' : 'защищённая панель'}
              </p>
            </div>
          </div>

          <p className="text-[13px] text-text-muted mt-5 mb-5 leading-relaxed">
            {needsSetup
              ? 'Придумайте логин и пароль для входа в панель. Вводить их в Настройках потом не придётся — здесь создаётся первый доступ.'
              : 'Введите логин и пароль, заданные при настройке панели.'}
          </p>

          {err && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-danger/10 border border-danger/30 text-danger text-[13px]">
              {err}
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <label className="block">
              <span className="block text-[11px] uppercase tracking-wide text-text-muted mb-1.5">Логин</span>
              <input
                className={inputCls} value={login} autoFocus autoComplete="username"
                onChange={(e) => setLogin(e.target.value)} placeholder="например admin"
                disabled={busy}
              />
            </label>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-wide text-text-muted mb-1.5">Пароль</span>
              <div className="relative">
                <input
                  className={inputCls + ' pr-11'} type={showPass ? 'text' : 'password'} value={password}
                  autoComplete={needsSetup ? 'new-password' : 'current-password'}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={onKey} onKeyDown={onKey}
                  placeholder={needsSetup ? 'минимум 8 символов' : '••••••••'}
                  disabled={busy}
                />
                <button
                  type="button" onClick={() => setShowPass(v => !v)}
                  title={showPass ? 'Скрыть пароль' : 'Показать пароль'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md text-text-muted hover:text-text hover:bg-bg-elevated transition-colors text-xs"
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </label>

            {needsSetup && (
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wide text-text-muted mb-1.5">Пароль ещё раз</span>
                <input
                  className={inputCls} type={showPass ? 'text' : 'password'} value={confirm}
                  autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)}
                  placeholder="повторите пароль" disabled={busy}
                />
              </label>
            )}

            {capsOn && <div className="-mt-1 text-[11px] text-warning">Caps Lock включён</div>}

            <button
              type="submit" disabled={busy}
              className="mt-1 w-full py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-60"
            >
              {busy ? 'Проверяем…' : (needsSetup ? 'Задать пароль и войти' : 'Войти')}
            </button>
          </form>

          <p className="mt-5 pt-4 border-t border-border/70 text-[11px] text-text-muted leading-relaxed">
            Пароль хранится только в виде хеша (scrypt) в файле <span className="font-mono">/root/.lifeos/auth.json</span>;
            изменить его можно в разделе «Настройки → Безопасность».
          </p>

          {needsSetup && (
            <button
              type="button" onClick={skip}
              className="mt-3 w-full text-[12px] text-text-muted hover:text-text underline underline-offset-2 transition-colors"
            >
              Пропустить — открыть панель без пароля
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
