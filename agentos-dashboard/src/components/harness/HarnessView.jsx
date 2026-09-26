import { useState, useEffect } from 'react'
import { Icon } from '../Icons'

const API = '/api'

// One installable row: engines (binaries) and components (systemd services) share it.
function ItemCard({ item, keys, busyId, busyOp, logs, onInstall, onUninstall, onUpdate, onKey, onSetup }) {
  const [textInput, setTextInput] = useState('')
  const missingKey = item.installed && item.key && !keys.some(k => k.env === item.key)
  const busy = busyId === item.id
  return (
    <div className="glass rounded-xl p-4 border"
      style={{ borderColor: item.installed ? 'rgb(var(--cx-success) / 0.35)' : 'rgb(var(--cx-warning) / 0.35)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.installed ? 'bg-success' : 'bg-warning'}`} />
          <h3 className="text-lg font-semibold text-text truncate">{item.name}</h3>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 ${item.installed ? 'text-success bg-success/15' : 'text-warning bg-warning/15'}`}>
          {item.installed ? '✓ установлен' : 'не установлен'}
        </span>
      </div>
      <p className="text-sm text-text-muted mt-1.5">{item.desc}</p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {item.installed ? (
          <>
            <span className="px-2 py-1 rounded text-xs bg-bg-elevated border border-border text-text-muted">готов к работе</span>
            {missingKey && (
              <span className="px-2 py-1 rounded text-xs bg-danger/15 border border-border text-danger">
                ⚠ нет ключа {item.key} — добавь в разделе «Ключи»
              </span>
            )}
            {item.updateCmd && (
              <button onClick={() => onUpdate(item.id)} disabled={!!busyId}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 ${busy && busyOp === 'update' ? 'opacity-60' : ''}`}>
                {busy && busyOp === 'update' ? '⏳ Обновление...' : '⬆ Обновить'}
              </button>
            )}
            {item.uninstallCmd && (
              <button onClick={() => onUninstall(item.id)} disabled={!!busyId}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 ${busy && busyOp === 'uninstall' ? 'opacity-60' : ''}`}>
                {busy && busyOp === 'uninstall' ? '⏳ Удаление...' : '🗑 Удалить'}
              </button>
            )}
            {item.id === 'hermes' && item.setupAvailable && (
              <button onClick={() => onSetup(item.id)} disabled={!!busyId}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 ${busy && busyOp === 'setup' ? 'opacity-60' : ''}`}>
                {busy && busyOp === 'setup' ? '⏳ Мастер запущен...' : '⚙ Мастер настроек'}
              </button>
            )}
            {!item.uninstallCmd && item.id === 'hermes' && null}
          </>
        ) : (
          <>
            <button onClick={() => onInstall(item.id)} disabled={!!busyId}
              className={`px-4 py-2 rounded-lg font-medium text-sm text-white bg-accent hover:opacity-90 transition-opacity ${busy ? 'opacity-60' : ''}`}>
              {busy && busyOp === 'install' ? '⏳ Устанавливается...' : `⬇ Установить ${item.name}`}
            </button>
            {item.installCmd && !item.needsInstallOptions && (
              <code className="px-2 py-1 rounded text-[11px] bg-bg-elevated border border-border text-text-muted font-mono break-all max-w-full">{item.installCmd}</code>
            )}
            {item.needsInstallOptions && (
              <span className="text-[11px] text-text-muted">откроется мастер: режим, домен и защита</span>
            )}
            {item.key && <span className="text-[11px] text-text-muted">требуется {item.key}</span>}
          </>
        )}
      </div>
      {/* Live screen of an interactive install. The wizard marks the highlighted option with
          a leading "→" and keeps "(●)" on the *recommended* row (it never moves), so the
          selected line is highlighted here — otherwise "which one am I choosing?" is
          unreadable. */}
      {logs[item.id] && (
        <div className="mt-2 bg-bg-elevated border border-border rounded-lg p-2 max-h-[200px] overflow-auto">
          <div className="text-[11px] font-mono text-text whitespace-pre-wrap break-words">{logs[item.id].split('\n').map((line, i) => (
              /^\s*→/.test(line)
                ? <span key={i} className="text-accent font-semibold">{line + '\n'}</span>
                : line + '\n'
            ))}</div>
          {/^\s*→\s/m.test(logs[item.id]) && (
            <p className="mt-1 pt-1 border-t border-border text-[10px] text-text-muted">
              Сейчас выбрана строка со стрелкой <span className="text-accent font-semibold">→</span>.
              Значок <span className="font-semibold">(●)</span> — просто «рекомендованный вариант», он не двигается;
              переключение — кнопками <span className="font-semibold">↑</span>/<span className="font-semibold">↓</span>, подтверждение — <span className="font-semibold">⏎ Enter</span>.
            </p>
          )}
        </div>
      )}
      {/* Interactive installs (Hermes: `hermes setup` is an arrow-key menu running in a PTY)
          — the keystrokes are forwarded to the live process. */}
      {busy && (busyOp === 'install' || busyOp === 'uninstall' || busyOp === 'setup') && item.interactive && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[11px] text-text-muted mr-1">Управление установкой:</span>
          {[['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '→'], ['enter', '⏎ Enter'],
            ['space', 'Пробел'], ['y', 'y'], ['n', 'n'], ['esc', 'Esc']].map(([k, label]) => (
            <button key={k} onClick={() => onKey(item.id, k)}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-bg-elevated text-text hover:border-accent hover:text-accent transition-colors">
              {label}
            </button>
          ))}
          {/* The wizard also asks for typed answers (API key, model name) — send a line. */}
          <div className="flex items-center gap-1.5 w-full mt-1">
            <input value={textInput} onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { onKey(item.id, null, textInput + '\n'); setTextInput('') } }}
              placeholder="ввести текст (ключ, ответ) и нажать Отправить"
              className="flex-1 min-w-[180px] px-2 py-1 rounded-md bg-bg-elevated border border-border text-text text-xs focus:outline-none focus:border-accent" />
            <button onClick={() => { onKey(item.id, null, textInput + '\n'); setTextInput('') }}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
              Отправить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function HarnessView() {
  const [harnesses, setHarnesses] = useState([])
  const [components, setComponents] = useState([])
  const [error, setError] = useState(null)
  const [installing, setInstalling] = useState(null)
  const [uninstalling, setUninstalling] = useState(null)
  const [updating, setUpdating] = useState(null)
  const [setting, setSetting] = useState(null)   // engine's interactive setup wizard running
  const [logs, setLogs] = useState({})
  const [keys, setKeys] = useState([])
  // Install options modal: mode (tui/web/both) + domain for the web UI, plus the
  // dashboard auth gate for Hermes (basic / oauth / both).
  // The domain is deliberately EMPTY: it is the user's own domain, so the field only
  // carries an example placeholder instead of pre-filling the Life OS host's domain.
  const [installOpts, setInstallOpts] = useState(null) // { id, name, mode, domain, protection }

  const load = async () => {
    try {
      const [h, k, c] = await Promise.all([
        fetch(`${API}/harnesses`).then(r => r.json()),
        fetch(`${API}/keys`).then(r => r.json()),
        fetch(`${API}/components`).then(r => r.json()).catch(() => ({ components: [] })),
      ])
      setHarnesses(h.harnesses || [])
      setKeys(k.keys || [])
      setComponents(c.components || [])
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const allItems = [...components, ...harnesses]

  // poll the active op (install / uninstall / update) while running
  const busyId = installing || uninstalling || updating || setting
  const busyOp = updating ? 'update' : uninstalling ? 'uninstall' : setting ? 'setup' : 'install'
  useEffect(() => {
    if (!busyId) return
    const kind = busyOp
    const timer = setInterval(async () => {
      try {
        // components and harnesses have separate status endpoints; probe both
        // (a setup run lives in the harness store only)
        let d = kind === 'setup' ? null
          : await (await fetch(`${API}/components/${kind}/status?id=${busyId}`)).json().catch(() => null)
        if (!d || d.state === 'none') {
          d = await (await fetch(`${API}/harness/${kind === 'setup' ? 'install' : kind}/status?id=${busyId}`)).json()
        }
        if (d?.log) setLogs(prev => ({ ...prev, [busyId]: d.log }))
        if (d?.state === 'done' || d?.state === 'error') {
          if (kind === 'install') setInstalling(null)
          else if (kind === 'uninstall') setUninstalling(null)
          else if (kind === 'setup') setSetting(null)
          else setUpdating(null)
          load()  // re-detect installation state
        }
      } catch {}
    }, 2500)
    return () => clearInterval(timer)
  }, [busyId, busyOp])

  const runInstall = async (id, opts) => {
    try {
      const isComponent = components.some(c => c.id === id)
      const ep = isComponent ? 'components' : 'harness'
      await fetch(`${API}/${ep}/install`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...opts }) })
      setInstalling(id); setLogs(prev => ({ ...prev, [id]: '⏳ установка запущена...' }))
    } catch (e) { setError(e.message) }
  }

  const install = async (id) => {
    const item = allItems.find(x => x.id === id)
    if (item?.needsInstallOptions) {
      setInstallOpts({ id, name: item.name, mode: 'both', protection: 'basic', domain: '' })
      return
    }
    runInstall(id)
  }

  // Forward a keystroke to a running interactive install (arrow-key menus).
  const sendKey = async (id, key, text) => {
    try {
      const r = await fetch(`${API}/harness/install/keys`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(text != null ? { id, text } : { id, key }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || `keys: ${r.status}`) }
    } catch (e) { setError(e.message) }
  }

  const confirmInstallOpts = async () => {
    if (!installOpts) return
    const { id, mode, domain, protection, basicUser, basicPass } = installOpts
    setInstallOpts(null)
    await runInstall(id, { mode, domain, protection, basicUser, basicPass })
  }

  // Open an installed engine's interactive setup wizard (Hermes: choose the AI provider).
  const openSetup = async (id) => {
    try {
      await fetch(`${API}/harness/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setSetting(id); setLogs(prev => ({ ...prev, [id]: '⏳ запускаю мастер настроек...' }))
    } catch (e) { setError(e.message) }
  }

  const uninstall = async (id) => {
    try {
      const isComponent = components.some(c => c.id === id)
      const ep = isComponent ? 'components' : 'harness'
      await fetch(`${API}/${ep}/uninstall`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setUninstalling(id); setLogs(prev => ({ ...prev, [id]: '⏳ удаление запущено...' }))
    } catch (e) { setError(e.message) }
  }

  const update = async (id) => {
    try {
      await fetch(`${API}/harness/update`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setUpdating(id); setLogs(prev => ({ ...prev, [id]: '⏳ обновление запущено...' }))
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text">Установка компонентов</h1>
        <p className="text-text-muted mt-1">Компоненты и движки ставятся одной кнопкой. Вкладки установленных компонентов (n8n, Coder) появляются в меню автоматически.</p>
      </div>

      {components.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
            <Icon name="Boxes" size={14} /> Компоненты
          </h2>
          {components.map(c => (
            <ItemCard key={c.id} item={c} keys={keys} busyId={busyId} busyOp={busyOp}
              logs={logs} onInstall={install} onUninstall={uninstall} onUpdate={update} onKey={sendKey} onSetup={openSetup} />
          ))}
        </>
      )}

      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
        <Icon name="Wrench" size={14} /> Движки (агенты)
      </h2>
      {harnesses.map(h => (
        <ItemCard key={h.id} item={h} keys={keys} busyId={busyId} busyOp={busyOp}
          logs={logs} onInstall={install} onUninstall={uninstall} onUpdate={update} onKey={sendKey} onSetup={openSetup} />
      ))}

      {error && <p className="text-sm text-danger">Ошибка: {error}</p>}

      {/* Install options modal (OpenCode: TUI / Web / both + domain) */}
      {installOpts && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-3 sm:p-4 flex items-start sm:items-center justify-center"
          onClick={() => setInstallOpts(null)}>
          <div className="glass rounded-xl border border-border p-4 sm:p-5 w-full max-w-md space-y-4 my-2 sm:my-0 max-h-[92vh] overflow-y-auto overscroll-contain"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-text">Установка {installOpts.name}</h3>
            <div className="space-y-2">
              <p className="text-sm text-text-muted">Что установить:</p>
              {[
                { v: 'tui', label: '💻 Только TUI', hint: 'терминальный интерфейс' },
                { v: 'web', label: '🌐 Только Web UI', hint: 'веб-интерфейс на своём домене' },
                { v: 'both', label: '💻🌐 Всё вместе', hint: 'TUI + Web UI' },
              ].map(o => (
                <button key={o.v} onClick={() => setInstallOpts(p => ({ ...p, mode: o.v }))}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${installOpts.mode === o.v ? 'border-accent bg-accent/10' : 'border-border hover:bg-bg-elevated'}`}>
                  <div className="text-sm font-medium text-text">{o.label}</div>
                  <div className="text-xs text-text-muted">{o.hint}</div>
                </button>
              ))}
            </div>
            {installOpts.mode !== 'tui' && (
              <div>
                <label className="text-sm text-text-muted block mb-1">Домен для Web UI:</label>
                <input value={installOpts.domain}
                  onChange={e => setInstallOpts(p => ({ ...p, domain: e.target.value }))}
                  placeholder={installOpts.id === 'hermes' ? 'например, hermes.example.com' : 'например, oc.example.com'}
                  className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent" />
                <p className="text-xs text-text-muted mt-1">
                  {installOpts.id === 'hermes'
                    ? 'Добавится в Caddy → reverse_proxy на dashboard Hermes (:9119).'
                    : 'Добавится в Caddy → reverse_proxy на opencode (:4096).'}
                </p>
              </div>
            )}
            {installOpts.id === 'hermes' && installOpts.mode !== 'tui' && (
              <div className="space-y-2">
                <p className="text-sm text-text-muted">Защита Web UI:</p>
                {[
                  { v: 'basic', label: '🔒 Basic Auth', hint: 'логин и пароль Hermes-дэшборда (для доверенной сети)' },
                  { v: 'oauth', label: '🔑 OAuth (Nous Portal)', hint: 'вход через аккаунт Nous — рекомендовано для публичного домена' },
                  { v: 'both', label: '🔒🔑 Оба', hint: 'пароль + OAuth' },
                ].map(o => (
                  <button key={o.v} onClick={() => setInstallOpts(p => ({ ...p, protection: o.v }))}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${installOpts.protection === o.v ? 'border-accent bg-accent/10' : 'border-border hover:bg-bg-elevated'}`}>
                    <div className="text-sm font-medium text-text">{o.label}</div>
                    <div className="text-xs text-text-muted">{o.hint}</div>
                  </button>
                ))}
                {(installOpts.protection === 'basic' || installOpts.protection === 'both') && (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="text-sm text-text-muted block mb-1">Логин для входа в Web UI:</label>
                      <input value={installOpts.basicUser || ''}
                        onChange={e => setInstallOpts(p => ({ ...p, basicUser: e.target.value }))}
                        placeholder="например, admin"
                        className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent" />
                    </div>
                    <div>
                      <label className="text-sm text-text-muted block mb-1">Пароль:</label>
                      <input value={installOpts.basicPass || ''} type="text" autoComplete="new-password"
                        onChange={e => setInstallOpts(p => ({ ...p, basicPass: e.target.value }))}
                        placeholder="минимум 8 символов, без пробелов и кавычек"
                        className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent" />
                      <p className="text-xs text-text-muted mt-1">
                        Оставь поле пустым — сгенерирую надёжный пароль. Заданные значения сохранятся
                        в <code className="text-[11px]">/root/.hermes-web-auth</code> и будут видны во вкладке «Ключи» → Hermes.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Sticky so Отмена/Установить stay reachable on a phone (modal scrolls). */}
            <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 mt-1 bg-bg-card/95 backdrop-blur border-t border-border flex gap-2 justify-end">
              <button onClick={() => setInstallOpts(null)}
                className="px-4 py-2 rounded-lg text-sm border border-border text-text-muted hover:text-text">Отмена</button>
              <button onClick={confirmInstallOpts}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-accent hover:opacity-90"
                disabled={installOpts.mode !== 'tui' && !installOpts.domain.trim()}>
                Установить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
