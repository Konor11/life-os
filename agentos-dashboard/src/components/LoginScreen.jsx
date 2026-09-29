import { useCallback, useEffect, useState } from 'react'

// Окно входа Life OS. Показано, пока панель закрыта паролем (задаётся при установке) либо пока
// он ещё не задан на этой установке — тогда это форма первоначальной настройки.
//
// Реализация: логин/пароль проверяет бэкенд (/api/auth/login), пароль он хранит только scrypt-хешем.
// Сессия — подписанная HttpOnly-кука, поэтому пароль нигде в браузере не лежит.

const style = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24, background: 'rgb(var(--bg-app, #f5f6f8))',
  },
  card: {
    width: '100%', maxWidth: 380, background: 'rgb(var(--bg-card, #ffffff))',
    border: '1px solid rgb(var(--border, #e5e7eb))', borderRadius: 14, padding: 24,
    boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
  },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'rgb(var(--text, #111827))' },
  sub: { fontSize: 13, marginBottom: 18, color: 'rgb(var(--text-muted, #6b7280))' },
  label: { display: 'block', fontSize: 12, marginBottom: 4, color: 'rgb(var(--text-muted, #6b7280))' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px', marginBottom: 12,
    borderRadius: 8, border: '1px solid rgb(var(--border, #d1d5db))',
    background: 'rgb(var(--bg-input, #ffffff))', color: 'rgb(var(--text, #111827))',
    fontSize: 14, outline: 'none',
  },
  btn: {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'rgb(var(--accent, #4f46e5))', color: '#fff', fontSize: 14, fontWeight: 600,
  },
  err: {
    fontSize: 12, marginBottom: 12, padding: '8px 10px', borderRadius: 8,
    background: 'rgba(220,38,38,0.10)', color: '#b91c1c', border: '1px solid rgba(220,38,38,0.25)',
  },
  hint: { fontSize: 11, marginTop: 14, color: 'rgb(var(--text-muted, #6b7280))', lineHeight: 1.45 },
}

export function LoginScreen({ onAuthenticated }) {
  const setup = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/status')
      const j = await r.json()
      return !!(j && j.required && !j.authenticated)
    } catch { return true }
  }, [])

  const [needsSetup, setNeedsSetup] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)

  // Режим настройки узнаём один раз: если пароля ещё нет — форма должна его создать.
  useEffect(() => {
    let alive = true
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(j => { if (alive) { setNeedsSetup(!!(j && j.needsSetup)); setChecked(true) } })
      .catch(() => { if (alive) setChecked(true) })
    return () => { alive = false }
  }, [])

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

  if (!checked) {
    return <div style={style.page}><div style={style.card}><div style={style.sub}>Проверяем доступ…</div></div></div>
  }

  return (
    <div style={style.page}>
      <form style={style.card} onSubmit={submit}>
        <div style={style.title}>{needsSetup ? 'Первоначальная настройка' : 'Life OS'}</div>
        <div style={style.sub}>
          {needsSetup
            ? 'Задайте логин и пароль для доступа к панели. Вводить их в Настройках потом не придётся — здесь создаётся первый доступ.'
            : 'Введите логин и пароль, заданные при установке.'}
        </div>
        {err ? <div style={style.err}>{err}</div> : null}
        <label style={style.label}>Логин</label>
        <input
          style={style.input} value={login} autoFocus autoComplete="username"
          onChange={(e) => setLogin(e.target.value)} placeholder="логин"
        />
        <label style={style.label}>Пароль</label>
        <input
          style={style.input} type="password" value={password}
          autoComplete={needsSetup ? 'new-password' : 'current-password'}
          onChange={(e) => setPassword(e.target.value)} placeholder="пароль"
        />
        {needsSetup && (
          <>
            <label style={style.label}>Пароль ещё раз</label>
            <input
              style={style.input} type="password" value={confirm} autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)} placeholder="пароль ещё раз"
            />
          </>
        )}
        <button style={style.btn} type="submit" disabled={busy}>
          {busy ? 'Проверяем…' : (needsSetup ? 'Задать пароль и войти' : 'Войти')}
        </button>
        <div style={style.hint}>
          Пароль хранится только в виде хеша (scrypt) в файле <code>/root/.lifeos/auth.json</code> и
          его можно сменить в разделе «Настройки → Безопасность».
          {needsSetup && (
            <button type="button" onClick={() => {
              // Пропустить: панель откроется без пароля. Флаг нужен, чтобы экран не возвращался
              // при каждой перезагрузке; при появлении пароля он больше не мешает.
              try { localStorage.setItem('lifeos.auth.setupSkipped', '1') } catch {}
              onAuthenticated && onAuthenticated(null)
            }} style={{ display: 'block', marginTop: 10, color: 'rgb(var(--text-muted, #6b7280))', textDecoration: 'underline', fontSize: 11 }}>
              Пропустить — открыть без пароля
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
