import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// Файл лежит в components/desktop/, поэтому Icons и Mascot — уровнем выше (../),
// а список движков — рядом (./ChatPanelEngines).
import { Icon } from '../Icons'
import { Mascot } from '../Mascot'
import { ENGINES, WEB_ENGINES, getEngineView, setEngineView } from './ChatPanelEngines'

// Полноценная вкладка «Настройки»: слева список разделов, справа содержимое выбранного.
// Разделы: Внешний вид · Движки · Безопасность · Система · Данные · О панели.
//
// Всё, что здесь меняется, сохраняется само (тема и вид движков — localStorage, учётные данные —
// на сервере), поэтому отдельная кнопка «Сохранить» не нужна и только вводила бы в заблуждение.

const SECTIONS = [
  { id: 'look', label: 'Внешний вид', icon: 'Sun' },
  { id: 'engines', label: 'Движки', icon: 'Terminal' },
  { id: 'security', label: 'Безопасность', icon: 'Key' },
  { id: 'system', label: 'Система', icon: 'Settings' },
  { id: 'data', label: 'Данные', icon: 'Folder' },
  { id: 'about', label: 'О панели', icon: 'Brain' },
]

export function SettingsView({ theme, onToggleTheme }) {
  const [section, setSection] = useState('look')
  const [status, setStatus] = useState(null)
  const [components, setComponents] = useState(null)
  const [harnesses, setHarnesses] = useState(null)

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => setStatus({ error: 'бэкенд недоступен' }))
    fetch('/api/components').then(r => r.json()).then(d => setComponents(d.components || [])).catch(() => setComponents([]))
    fetch('/api/harnesses').then(r => r.json()).then(d => setHarnesses(d.harnesses || [])).catch(() => setHarnesses([]))
  }, [])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Icon name="Settings" size={18} className="text-accent" />
        <h2 className="font-semibold">Настройки</h2>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Разделы: колонка на десктопе, горизонтальная лента на телефоне */}
        <nav className="md:w-52 shrink-0 border-b md:border-b-0 md:border-r border-border overflow-x-auto md:overflow-y-auto">
          <div className="flex md:flex-col gap-1 p-2 md:p-3">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors shrink-0 ${
                  section === s.id
                    ? 'bg-accent text-white'
                    : 'text-text-muted hover:text-text hover:bg-bg-elevated'
                }`}
              >
                <Icon name={s.icon} size={16} />
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {section === 'look' && <LookSection theme={theme} onToggleTheme={onToggleTheme} />}
          {section === 'engines' && <EnginesSection harnesses={harnesses} />}
          {section === 'security' && <SecuritySection />}
          {section === 'system' && <SystemSection status={status} />}
          {section === 'data' && <DataSection status={status} components={components} />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- внешний вид ----

function LookSection({ theme, onToggleTheme }) {
  const [font, setFont] = useState(null)   // null = «по умолчанию для движка»
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setLoaded(true) }, [])

  const fontFor = useCallback((engine) => {
    try {
      const v = parseInt(localStorage.getItem(`lifeos.chat.fontSize.${engine}`), 10)
      return Number.isFinite(v) ? v : 11
    } catch { return 11 }
  }, [])

  return (
    <div className="space-y-6 max-w-2xl">
      <Group title="Тема" hint="Тема применяется сразу во всей панели и в терминалах.">
        <div className="grid grid-cols-2 gap-3">
          {[['light', '☀️', 'Светлая'], ['dark', '🌙', 'Тёмная']].map(([id, ic, label]) => (
            <button
              key={id}
              onClick={() => { if ((theme === 'dark') !== (id === 'dark')) onToggleTheme() }}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm transition-all ${
                theme === id
                  ? 'border-accent bg-accent/10 text-text font-medium'
                  : 'border-border bg-bg-card text-text-muted hover:border-border-hover'
              }`}
            >
              <span className="text-lg">{ic}</span>
              <span className="text-left">
                <span className="block">{label}</span>
                <span className="block text-[11px] text-text-muted">
                  {theme === id ? 'выбрана' : 'переключить'}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Group>

      <Group title="Кегль терминала" hint="У каждого движка свой размер шрифта — они не затирают друг друга.">
        <div className="space-y-2">
          {ENGINES.filter(e => e.category === 'general' || WEB_ENGINES.has(e.id) || e.id === 'codex' || e.id === 'claude').map(e => {
            const v = loaded ? fontFor(e.id) : 11
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-bg-elevated">
                <span className="text-sm text-text">{e.name}</span>
                <div className="flex items-center gap-1">
                  <Stepper value={v} min={4} max={24} onChange={(nv) => {
                    try { localStorage.setItem(`lifeos.chat.fontSize.${e.id}`, String(nv)) } catch {}
                    setFont(nv)
                  }} />
                  <button
                    onClick={() => { try { localStorage.removeItem(`lifeos.chat.fontSize.${e.id}`) } catch {}; setFont(null) }}
                    className="ml-2 text-[11px] text-text-muted hover:text-text underline underline-offset-2"
                  >
                    сброс
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </Group>

      <Group title="Экранная клавиатура" hint="Панель кнопок под терминалом — удобно на телефоне.">
        <Toggle
          storageKey="lifeos.chat.keypad"
          defaultOn={false}
          label="Показывать клавиатуру под терминалом"
        />
      </Group>
    </div>
  )
}

function Stepper({ value, min, max, onChange }) {
  const btn = 'w-7 h-7 rounded-md border border-border bg-bg-card text-text-muted hover:text-text flex items-center justify-center'
  return (
    <div className="flex items-center gap-1">
      <button className={btn} onClick={() => onChange(Math.max(min, value - 1))} title="Меньше">−</button>
      <span className="w-7 text-center text-sm font-mono text-text">{value}</span>
      <button className={btn} onClick={() => onChange(Math.min(max, value + 1))} title="Больше">+</button>
    </div>
  )
}

function Toggle({ storageKey, defaultOn, label, onChange }) {
  const [on, setOn] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey)
      return v === null ? defaultOn : v === '1'
    } catch { return defaultOn }
  })
  useEffect(() => {
    try { localStorage.setItem(storageKey, on ? '1' : '0') } catch {}
    onChange && onChange(on)
  }, [on])
  return (
    <button onClick={() => setOn(v => !v)} className="flex items-center justify-between gap-3 w-full px-3 py-2.5 rounded-lg bg-bg-elevated text-left">
      <span className="text-sm text-text">{label}</span>
      <span className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${on ? 'bg-accent' : 'bg-border'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-5' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

// -------------------------------------------------------------------- движки ----

function EnginesSection({ harnesses }) {
  const [views, setViews] = useState({})
  useEffect(() => {
    const m = {}
    for (const e of ENGINES) m[e.id] = getEngineView(e.id, 'web')
    setViews(m)
  }, [])

  const installed = useMemo(() => {
    const m = {}
    for (const h of harnesses || []) m[h.id] = !!h.installed
    return m
  }, [harnesses])

  return (
    <div className="space-y-6 max-w-2xl">
      <Group title="Чем открывать движок" hint="По умолчанию вкладка Chat открывает движок в этом режиме. TUI — терминал, Web — встроенный интерфейс движка.">
        <div className="space-y-1.5">
          {ENGINES.map(e => {
            const ok = installed[e.id]
            return (
              <div key={e.id} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${ok ? 'bg-bg-elevated' : 'bg-bg-elevated/40'}`}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-success' : 'bg-border'}`} />
                  <span className={`text-sm truncate ${ok ? 'text-text' : 'text-text-muted'}`}>{e.name}</span>
                  {!ok && <span className="text-[10px] text-text-muted shrink-0">не установлен</span>}
                </span>
                {WEB_ENGINES.has(e.id) && ok ? (
                  <div className="flex items-center gap-1 shrink-0">
                    {[['tui', '💻 TUI'], ['web', '🌐 Web']].map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => { setEngineView(e.id, v); setViews({ ...views, [e.id]: v }) }}
                        className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                          views[e.id] === v ? 'bg-accent text-white' : 'bg-bg-card border border-border text-text-muted hover:text-text'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-text-muted shrink-0">{ok ? 'только TUI' : '—'}</span>
                )}
              </div>
            )
          })}
        </div>
      </Group>
    </div>
  )
}

// --------------------------------------------------------------- безопасность ----

// Пользователи и роли. Список и правка — только для администратора (бэкенд проверяет и сам:
// даже если подделать запрос, без роли admin эндпоинты вернут 403).
const ROLE_OPTS = [
  { id: 'admin', label: 'Администратор' },
  { id: 'user', label: 'Пользователь' },
  { id: 'viewer', label: 'Наблюдатель' },
]

function UsersGroup({ onChanged }) {
  const [data, setData] = useState(null)
  const [login, setLogin] = useState('')
  const [pass, setPass] = useState('')
  const [role, setRole] = useState('user')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch('/api/auth/users', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => (j && j.users ? setData(j) : setErr(j.error || 'не удалось')))
      .catch(() => setErr('не удалось'))
  }, [])
  useEffect(() => { load() }, [load])

  const call = async (url, method, body) => {
    setMsg(''); setErr(''); setBusy(true)
    try {
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setErr(j.error || 'не удалось'); return false }
      setMsg('Готово')
      load(); onChanged && onChanged()
      return true
    } catch (e) { setErr(String(e?.message || e)); return false } finally { setBusy(false) }
  }

  const add = async () => {
    if (pass.length < 8) return setErr('пароль короче 8 символов')
    if (await call('/api/auth/users', 'POST', { login, password: pass, role })) {
      setLogin(''); setPass('')
    }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'
  const roleLabel = (r) => (ROLE_OPTS.find(x => x.id === r) || {}).label || r

  return (
    <Group title="Пользователи и доступ"
      hint="Администратор — всё. Пользователь — работа с данными и чат, но без терминала, файлов и установки движков. Наблюдатель — только просмотр. Пароль каждого хранится отдельно, в виде scrypt-хеша.">
      <div className="space-y-2.5">
        {(data?.users || []).map(u => (
          <div key={u.login} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
            <span className="text-sm text-text font-medium w-40 truncate">{u.login}</span>
            <select
              value={u.role}
              onChange={e => call('/api/auth/user', 'POST', { login: u.login, role: e.target.value })}
              className="px-2 py-1 rounded-lg bg-bg border border-border text-text text-xs"
            >
              {ROLE_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <span className="text-xs text-text-muted flex-1">
              {u.createdAt ? 'с ' + new Date(u.createdAt).toLocaleDateString('ru-RU') : ''}
            </span>
            <button
              onClick={() => {
                const p = window.prompt(`Новый пароль для ${u.login} (мин. 8 символов)`)
                if (p) call('/api/auth/user', 'POST', { login: u.login, password: p })
              }}
              className="px-2.5 py-1 rounded-lg border border-border text-text-muted text-xs hover:text-text">пароль</button>
            <button
              onClick={() => { if (window.confirm(`Удалить ${u.login}? Его входы сразу перестанут работать.`)) call('/api/auth/user', 'DELETE', { login: u.login }) }}
              className="px-2.5 py-1 rounded-lg border border-border text-danger/80 text-xs hover:text-danger">удалить</button>
          </div>
        ))}

        <div className="pt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className={input} placeholder="логин нового" value={login} onChange={e => setLogin(e.target.value)} />
          <input className={input} type="password" placeholder="пароль (мин. 8)" value={pass} onChange={e => setPass(e.target.value)} />
          <div className="flex gap-2">
            <select value={role} onChange={e => setRole(e.target.value)} className="px-2 py-2 rounded-lg bg-bg border border-border text-text text-sm">
              {ROLE_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <button onClick={add} disabled={busy} className="px-4 py-2 rounded-lg bg-accent text-white text-sm disabled:opacity-60">Добавить</button>
          </div>
        </div>
        {msg && <div className="text-xs text-success">{msg}</div>}
        {err && <div className="text-xs text-danger">{err}</div>}
      </div>
    </Group>
  )
}

function SecuritySection() {
  const [info, setInfo] = useState(null)
  const [login, setLogin] = useState('')
  const [current, setCurrent] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch('/api/auth/status').then(r => r.json()).then(setInfo).catch(() => setInfo(null))
  }, [])
  useEffect(() => { load() }, [load])

  const firstTime = info && !info.required

  const save = async () => {
    setMsg(''); setErr('')
    if (firstTime && (!pass || pass.length < 8)) return setErr('пароль короче 8 символов')
    if (!firstTime && !current) return setErr('нужен текущий пароль')
    if (!firstTime && !pass) return setErr('новый пароль пустой — менять нечего')
    setBusy(true)
    try {
      const url = firstTime ? '/api/auth/setup' : '/api/auth/change'
      // Логин больше не переименовывается: он идентичность пользователя, и переименование
      // ломало бы его пароль и все его сессии. Логин меняется только созданием нового
      // пользователя и удалением старого.
      const body = firstTime
        ? { login: login || 'admin', password: pass }
        : { currentPassword: current, password: pass }
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setErr(j.error || 'не удалось сохранить'); return }
      try { localStorage.removeItem('lifeos.auth.setupSkipped') } catch {}
      setMsg(firstTime ? 'Пароль задан. Теперь вход обязателен.' : 'Сохранено. Старые сессии обесценены.')
      setLogin(''); setPass(''); setCurrent('')
      load()
    } catch (e) { setErr(String(e?.message || e)) } finally { setBusy(false) }
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  return (
    <div className="space-y-6 max-w-2xl">
      <Group title="Вход в панель" hint="Пароль хранится только как scrypt-хеш в /root/.lifeos/auth.json — восстановить его нельзя, только задать новый.">
        <div className="space-y-2.5">
          <InfoRow label="Состояние" value={info ? (info.required ? 'включён' : 'выключен') : '—'} />
          <InfoRow label="Логин" value={info?.login || '—'} mono />
          <InfoRow label="Ваша роль" value={info?.role === 'admin' ? 'Администратор' : info?.role === 'user' ? 'Пользователь' : info?.role === 'viewer' ? 'Наблюдатель' : '—'} />
          <InfoRow label="Можно" value={info?.isAdmin ? 'всё, включая терминал и установку движков' : info?.role === 'user' ? 'данные и чат' : 'только просмотр'} />
          {info?.required && info?.authenticated && (
            <div className="flex items-center gap-1.5 text-xs text-success pt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success" /> вы вошли как {info.login}
            </div>
          )}
          {firstTime && <input className={input} placeholder="Логин (например admin)" value={login} onChange={e => setLogin(e.target.value)} />}
          {!firstTime && <input className={input} type="password" placeholder="Текущий пароль" value={current} onChange={e => setCurrent(e.target.value)} />}
          {!firstTime && <input className={input} type="password" placeholder="Новый пароль (мин. 8 символов)" value={pass} onChange={e => setPass(e.target.value)} />}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-accent text-white text-sm disabled:opacity-60">
              {busy ? 'Сохраняю…' : (firstTime ? 'Задать пароль' : 'Сменить')}
            </button>
            {info?.required && (
              <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.reload() }}
                className="px-4 py-2 rounded-lg border border-border text-text-muted text-sm hover:text-text">
                Выйти
              </button>
            )}
            {msg && <span className="text-xs text-success">{msg}</span>}
            {err && <span className="text-xs text-danger">{err}</span>}
          </div>
        </div>
      </Group>

      {info?.isAdmin && <UsersGroup onChanged={load} />}

      <Group title="Что закрыто паролем" hint="Пароль защищает всё, кроме самого окна входа: статику отдаёт отдельный процесс, иначе форму негде рисовать.">
        <ul className="text-sm text-text-muted space-y-1.5">
          <li className="flex gap-2"><span className="text-success">✓</span> все <code className="text-xs">/api/*</code> — данные, агенты, установка, файлы</li>
          <li className="flex gap-2"><span className="text-success">✓</span> WebSocket <code className="text-xs">/ws/tui</code> — запуск и ввод в терминалы</li>
          <li className="flex gap-2"><span className="text-success">✓</span> сессия — подписанная HttpOnly-кука, пароль в браузере не лежит</li>
        </ul>
      </Group>
    </div>
  )
}

// --------------------------------------------------------------------- система ----

function SystemSection({ status }) {
  if (!status) return <div className="text-sm text-text-muted">Читаю состояние сервера…</div>
  if (status.error) return <div className="text-sm text-danger">{status.error}</div>
  const up = (n) => (n == null ? '—' : n < 90 ? `${Math.round(n)} с` : `${Math.round(n / 60)} мин`)
  return (
    <div className="space-y-6 max-w-2xl">
      <Group title="Сервер">
        <InfoRow label="Хост" value={status.host} mono />
        <InfoRow label="Платформа" value={`${status.platform}/${status.arch}`} mono />
        <InfoRow label="Работает" value={up(status.uptime)} />
        <InfoRow label="CPU load" value={(status.cpuLoad || []).map(x => x.toFixed(2)).join(' / ')} mono />
        <InfoRow label="RAM (RSS)" value={`${Math.round((status.mem?.rss || 0) / 1024 / 1024)} МБ`} mono />
        <InfoRow label="OpenRouter" value={status.openrouter === 'missing' ? 'не задан' : 'задан'} />
      </Group>
      <Group title="Резервное копирование">
        <InfoRow label="Копии создаются" value="раз в сутки + при старте сервера" />
        <InfoRow label="Где хранятся" value="/root/lifeos-backups" mono />
      </Group>
      <Group title="Профили агентов">
        <div className="flex flex-wrap gap-2 pt-1">
          {(status.profiles || []).map(p => (
            <span key={p} className="px-2 py-1 rounded-md bg-bg-elevated text-xs text-text-muted">{p}</span>
          ))}
          {!(status.profiles || []).length && <span className="text-xs text-text-muted">профилей нет</span>}
        </div>
      </Group>
    </div>
  )
}

// ----------------------------------------------------------------------- данные ----

function DataSection({ status, components }) {
  const [backups, setBackups] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  const loadBackups = useCallback(() => {
    fetch('/api/backup/list').then(r => r.json()).then(setBackups).catch(() => setBackups(null))
  }, [])
  useEffect(() => { loadBackups() }, [loadBackups])

  const doBackup = async () => {
    setMsg(''); setErr('')
    const r = await fetch('/api/backup/now', { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) { setErr(j.error || 'не удалось'); return }
    setMsg('Копия создана'); loadBackups()
  }

  const doImport = async (file) => {
    if (!file) return
    setMsg(''); setErr('')
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      if (!window.confirm('Импорт ЗАМЕНИТ текущие данные разделов. Продолжить?')) return
      const r = await fetch('/api/data/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setErr(j.error || 'не удалось'); return }
      setMsg(`Импортировано: ${(j.imported || []).join(', ')} — обновите страницу (F5)`)
    } catch (e) { setErr('файл не читается как JSON') }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Group title="Где лежат данные">
        <InfoRow label="Каталог данных" value={status?.dataDir || '—'} mono />
        <InfoRow label="Песочница файлов" value="/root, /tmp, /home" mono />
        <p className="text-xs text-text-muted pt-2 leading-relaxed">
          Терминал и файловый менеджер работают только внутри песочницы. Учётные данные входа —
          <code className="text-xs"> /root/.lifeos/auth.json</code> (в репозиторий не попадают).
        </p>
      </Group>
      <Group title="Резервные копии" hint="Раз в сутки данные складываются в /root/lifeos-backups, хранятся последние копии. Можно создать копию и вручную.">
        <div className="space-y-2">
          <InfoRow label="Папка копий" value={backups?.dir || '/root/lifeos-backups'} mono />
          <InfoRow label="Хранится копий" value={backups?.files?.length ?? '—'} />
          <InfoRow label="Последняя копия" value={backups?.last?.at ? new Date(backups.last.at).toLocaleString('ru-RU') : 'при старте сервера'} />
          <div className="flex items-center gap-2 pt-1">
            <button onClick={doBackup} className="px-4 py-2 rounded-lg bg-accent text-white text-sm">Создать копию сейчас</button>
            <button onClick={loadBackups} className="px-4 py-2 rounded-lg border border-border text-text-muted text-sm hover:text-text">Обновить список</button>
            {msg && <span className="text-xs text-success">{msg}</span>}
            {err && <span className="text-xs text-danger">{err}</span>}
          </div>
        </div>
      </Group>

      <Group title="Экспорт и импорт" hint="Выгружает все разделы одним JSON-файлом и принимает такой же файл обратно. Учётные данные входа в выгрузку НЕ входят.">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/data/export" download
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm no-underline">Выгрузить данные (JSON)</a>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => doImport(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded-lg border border-border text-text-muted text-sm hover:text-text">Загрузить файл</button>
        </div>
      </Group>

      <Group title="Компоненты">
        <div className="space-y-1.5">
          {(components || []).map(c => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-bg-elevated">
              <span className="text-sm text-text">{c.name}</span>
              <span className={`text-xs ${c.installed ? 'text-success' : 'text-text-muted'}`}>
                {c.installed ? 'установлен' : 'не установлен'}
              </span>
            </div>
          ))}
          {!(components || []).length && <div className="text-xs text-text-muted">список не загружен</div>}
        </div>
      </Group>
    </div>
  )
}

// ------------------------------------------------------------------ о панели ----

function AboutSection() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4 p-4 rounded-xl bg-bg-elevated">
        <Mascot size={56} className="text-accent" title="Life OS" />
        <div>
          <div className="font-semibold text-text">Life OS</div>
          <div className="text-xs text-text-muted">Mission Control для ИИ-агентов</div>
        </div>
      </div>
      <Group title="Что умеет">
        <ul className="text-sm text-text-muted space-y-1.5 leading-relaxed">
          <li>• ставит и удаляет движки прямо из панели, каждому — свой домен и пароль;</li>
          <li>• держит терминалы в tmux: закрыл вкладку или перезапустил панель — агент жив;</li>
          <li>• листание TUI жестом, инерция и кнопка «вниз» к живому хвосту;</li>
          <li>• «Лента» — читаемая история диалога из базы движка, без парсинга экрана;</li>
          <li>• вход по логину и паролю с хешированием и сменой прямо здесь.</li>
        </ul>
      </Group>
    </div>
  )
}

// ------------------------------------------------------------------ примитивы ----

function Group({ title, hint, children }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-text mb-1">{title}</h3>
      {hint && <p className="text-xs text-text-muted mb-3 leading-relaxed">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className={`text-sm text-text text-right truncate ${mono ? 'font-mono text-xs' : ''}`}>{value ?? '—'}</span>
    </div>
  )
}
