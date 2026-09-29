import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from './Icons'
import { Mascot } from './Mascot'
import { EmptyState } from './PanelUX'
import { toast } from './PanelUX'

// Процессы сервера: что реально висит, что из этого мусор, а что трогать нельзя.
//
// Зачем этот раздел: движки оставляют после себя фоновые демоны. Те живут месяцами, держат
// сотни мегабайт и не видны ни в списке сессий, ни в списке файлов — дважды такие «хвосты»
// пришлось искать вручную. Главная метка здесь — «файла нет на диске»: процесс работает из
// уже удалённого бинарника.
//
// Безопасность: завершать нельзя системные службы, саму панель и всё, что под её юнитом.
// Отказ приходит с объяснением, а не молчалив — чтобы было видно, что защита сработала.

const fmtElapsed = (sec) => {
  if (!sec || sec < 0) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d) return `${d} д ${h} ч`
  if (h) return `${h} ч ${m} мин`
  return `${m} мин`
}

const fmtMb = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} ГБ` : `${mb} МБ`)

const KIND = {
  lifeos: { label: 'панель', cls: 'text-accent', bg: 'bg-accent/10' },
  agent: { label: 'агент', cls: 'text-success', bg: 'bg-success/10' },
  service: { label: 'служба', cls: 'text-text-muted', bg: 'bg-bg-elevated' },
  system: { label: 'система', cls: 'text-text-muted', bg: 'bg-bg-elevated' },
  app: { label: 'программа', cls: 'text-text', bg: 'bg-bg-elevated' },
}

export function ProcessesView() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(0)          // pid в процессе завершения
  const [filter, setFilter] = useState('all')  // all | suspicious | app | agent
  const [onlyMine, setOnlyMine] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/processes', { cache: 'no-store' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || `запрос не удался (${r.status})`)
      }
      setData(await r.json())
      setErr('')
    } catch (e) { setErr(e.message) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const kill = async (p, force) => {
    const what = `${p.name} (pid ${p.pid}, ${fmtMb(p.rssMb)})`
    const msg = force
      ? `Убить ${what} принудительно? Действие необратимо.`
      : `Завершить ${what}? Процесс получит SIGTERM; если он его игнорирует, предложу добить.`
    if (!window.confirm(msg)) return
    setBusy(p.pid)
    try {
      const r = await fetch('/api/processes/kill', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: p.pid, force: !!force }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast(j.error || 'не удалось', { state: 'error' }); return }
      toast(j.note || 'завершён', { state: 'ok' })
      await load()
    } catch (e) { toast(String(e.message || e), { state: 'error' }) } finally { setBusy(0) }
  }

  const list = useMemo(() => {
    let l = data?.processes || []
    if (filter === 'suspicious') l = l.filter(p => p.flags.length)
    else if (filter === 'app') l = l.filter(p => p.kind === 'app')
    else if (filter === 'agent') l = l.filter(p => p.kind === 'agent')
    if (onlyMine) l = l.filter(p => p.canKill)
    return l
  }, [data, filter, onlyMine])

  const s = data?.stats
  const mood = s?.suspicious ? 'error' : (data ? 'idle' : 'idle')

  const row = (p) => {
    const k = KIND[p.kind] || KIND.app
    const gone = p.exeMissing
    return (
      <tr key={p.pid} className="border-b border-border/50 last:border-0 hover:bg-bg-elevated/40">
        <td className="py-2 pr-2 align-top">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm text-text font-medium">{p.name}</span>
            {gone && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/15 text-danger font-medium"
                title={`Файл программы удалён: ${p.exe || '—'}`}>
                файла нет на диске
              </span>
            )}
            {p.flags.includes('detached') && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning"
                title="Родитель — init: процесс никто не сторожит и не перезапустит">
                бесхозный
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${k.bg} ${k.cls}`}>{k.label}</span>
          </div>
          <div className="text-[11px] text-text-muted mt-0.5 break-all" title={p.cmd}>{p.cmd}</div>
          {p.unit && <div className="text-[10px] text-text-muted/80">юнит: {p.unit}</div>}
        </td>
        <td className="py-2 px-2 text-xs text-text-muted whitespace-nowrap">{p.pid}</td>
        <td className="py-2 px-2 text-xs text-text whitespace-nowrap">{fmtMb(p.rssMb)}</td>
        <td className="py-2 px-2 text-xs text-text-muted whitespace-nowrap">{fmtElapsed(p.elapsedSec)}</td>
        <td className="py-2 px-2 text-xs text-text-muted whitespace-nowrap">{p.cpuSec} с</td>
        <td className="py-2 pl-2 text-right whitespace-nowrap">
          {p.canKill ? (
            <div className="inline-flex gap-1.5">
              <button onClick={() => kill(p, false)} disabled={busy === p.pid}
                className="px-2.5 py-1 rounded-lg border border-border text-text-muted text-xs hover:text-text disabled:opacity-50">
                {busy === p.pid ? '…' : 'Завершить'}
              </button>
              <button onClick={() => kill(p, true)} disabled={busy === p.pid}
                className="px-2.5 py-1 rounded-lg border border-danger/40 text-danger/80 text-xs hover:text-danger disabled:opacity-50"
                title="SIGKILL — если процесс игнорирует обычное завершение">
                Убить
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-text-muted/70" title={p.notKillableBecause || 'защищён'}>
              {p.notKillableBecause || 'защищён'}
            </span>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Mascot size={44} state={mood} className="text-accent" title="Процессы сервера" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-text">Процессы</h1>
          <p className="text-xs text-text-muted">
            Что реально работает на сервере. Метка «файла нет на диске» означает, что программа
            удалена, а процесс продолжает жить — такие хвосты держат память и не видны нигде ещё.
          </p>
        </div>
        <button onClick={load}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-text shrink-0">
          Обновить
        </button>
      </div>

      {err && <div className="text-xs text-danger px-1">{err}</div>}

      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="glass p-3 rounded-lg">
            <div className="text-[11px] text-text-muted">Процессов</div>
            <div className="text-lg font-semibold text-text">{s.total}</div>
          </div>
          <div className="glass p-3 rounded-lg">
            <div className="text-[11px] text-text-muted">Память процессов</div>
            <div className="text-lg font-semibold text-text">{fmtMb(s.rssMb)}</div>
          </div>
          <div className={`glass p-3 rounded-lg ${s.suspicious ? 'border-danger/40' : ''}`}>
            <div className="text-[11px] text-text-muted">Подозрительных</div>
            <div className={`text-lg font-semibold ${s.suspicious ? 'text-danger' : 'text-text'}`}>{s.suspicious}</div>
          </div>
          <div className="glass p-3 rounded-lg">
            <div className="text-[11px] text-text-muted">Файла нет на диске</div>
            <div className={`text-lg font-semibold ${s.deletedExe ? 'text-danger' : 'text-text'}`}>{s.deletedExe}</div>
          </div>
        </div>
      )}

      {data && data.suspicious.length > 0 && (
        <div className="glass p-3 rounded-xl border-danger/30">
          <div className="text-sm font-medium text-text mb-1">Похоже на мусор</div>
          <div className="space-y-1">
            {data.suspicious.slice(0, 5).map(p => (
              <div key={p.pid} className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-text">{p.name}</span>
                <span className="text-text-muted">pid {p.pid} · {fmtMb(p.rssMb)} · {fmtElapsed(p.elapsedSec)}</span>
                {p.exeMissing && <span className="text-danger">файла нет на диске ({p.exe})</span>}
                {p.flags.includes('detached') && !p.exeMissing && <span className="text-warning">бесхозный процесс</span>}
                {p.canKill ? (
                  <button onClick={() => kill(p, false)} disabled={busy === p.pid}
                    className="ml-auto px-2.5 py-1 rounded-lg border border-border text-text-muted hover:text-text disabled:opacity-50">
                    {busy === p.pid ? '…' : 'Завершить'}
                  </button>
                ) : (
                  <span className="ml-auto text-[10px] text-text-muted/70">{p.notKillableBecause || 'защищён'}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {[
          ['all', 'Все'],
          ['suspicious', 'С метками'],
          ['app', 'Программы'],
          ['agent', 'Агенты'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === id ? 'bg-accent text-white' : 'text-text-muted hover:text-text hover:bg-bg-elevated'
            }`}>
            {label}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-text-muted ml-2 cursor-pointer">
          <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
          только те, что можно завершить
        </label>
      </div>

      {!data && !err && (
        <div className="glass p-4 rounded-xl">
          <EmptyState icon="Activity" mascot="idle" title="Читаю список процессов…" />
        </div>
      )}

      {data && list.length === 0 && (
        <div className="glass p-4 rounded-xl">
          <EmptyState icon="CheckCircle" mascot="ok" title="Пусто"
            hint={onlyMine ? 'Ничего нельзя завершить — все процессы либо системные, либо сама панель.' : 'Под этот фильтр ничего не попало.'} />
        </div>
      )}

      {data && list.length > 0 && (
        <div className="glass p-1 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] text-text-muted">
                <th className="py-2 px-2 font-medium">Процесс</th>
                <th className="py-2 px-2 font-medium">PID</th>
                <th className="py-2 px-2 font-medium">Память</th>
                <th className="py-2 px-2 font-medium">Работает</th>
                <th className="py-2 px-2 font-medium">CPU</th>
                <th className="py-2 px-2 font-medium text-right">Действие</th>
              </tr>
            </thead>
            <tbody>{list.map(row)}</tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-text-muted px-1">
        Список обновляется сам раз в 5 секунд. Системные службы, процессы самой панели и всё, что
        живёт в её systemd-юните, завершать нельзя — это защита, а не ошибка.
      </p>
    </div>
  )
}
