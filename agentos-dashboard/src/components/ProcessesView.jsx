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

// Данные и действия вынесены, чтобы компактная карточка на дашборде и полный список
// использовали один и тот же код: раньше логика «завершить» рисковала разъехаться.
function useProcesses(autoRefreshMs = 5000) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(0)          // pid в процессе завершения

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
    if (!autoRefreshMs) return
    const t = setInterval(load, autoRefreshMs)
    return () => clearInterval(t)
  }, [load, autoRefreshMs])

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

  return { data, err, busy, load, kill }
}

// Карточка для дашборда: коротко — что с сервером, и всё, что выглядит мусором. Полный список
// открывается прямо здесь, отдельной вкладки ради этого заводить не нужно.
export function ProcessesCard() {
  const { data, err, busy, load, kill } = useProcesses(5000)
  const [open, setOpen] = useState(false)
  const s = data?.stats

  if (err) {
    return (
      <div className="card-surface rounded-2xl p-4">
        <div className="text-sm font-medium text-text">Процессы</div>
        <div className="text-xs text-danger mt-1">{err}</div>
        <div className="text-[11px] text-text-muted mt-1">Доступно только администратору</div>
      </div>
    )
  }

  return (
    <div className="card-surface rounded-2xl p-4">
      <div className="flex items-center gap-2.5">
        <Mascot size={30} state={s?.suspicious ? 'error' : 'idle'} className="text-accent shrink-0"
          title="Состояние процессов" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text">Процессы</div>
          <div className="text-xs text-text-muted">
            {!data ? 'читаю список…' : s?.suspicious
              ? `подозрительных: ${s.suspicious}`
              : `всего ${s.total} · память ${fmtMb(s.rssMb)} · мусора нет`}
          </div>
        </div>
        {data && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted shrink-0">
            {fmtMb(s.rssMb)}
          </span>
        )}
      </div>

      {/* Мусор — сразу виден, без раскрытия: ради него карточка и делалась */}
      {data && data.suspicious.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-1">
          {data.suspicious.slice(0, 3).map(p => (
            <div key={p.pid} className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-text">{p.name}</span>
              <span className="text-text-muted">{fmtMb(p.rssMb)} · {fmtElapsed(p.elapsedSec)}</span>
              {p.exeMissing && <span className="text-danger">файла нет на диске</span>}
              {p.flags.includes('detached') && <span className="text-warning">бесхозный</span>}
              {p.canKill ? (
                <button onClick={() => kill(p, false)} disabled={busy === p.pid}
                  className="ml-auto px-2 py-0.5 rounded border border-border text-[10px] text-text-muted hover:text-text disabled:opacity-50">
                  {busy === p.pid ? '…' : 'Завершить'}
                </button>
              ) : (
                <span className="ml-auto text-[10px] text-text-muted/70">{p.notKillableBecause || 'защищён'}</span>
              )}
            </div>
          ))}
          {data.suspicious.length > 3 && (
            <div className="text-[10px] text-text-muted">и ещё {data.suspicious.length - 3} — раскрой список</div>
          )}
        </div>
      )}

      {/* Топ по памяти: кто вообще ест ресурс */}
      {data && !open && (
        {/* Подпись вида обязательна: без неё «3 строки» читаются как «3 сессии», хотя это
            процессы вообще — службы web-панелей, рантайм и агенты в одной куче. */}
        <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-0.5">
          {data.processes.slice(0, 3).map(p => {
            const k = KIND[p.kind] || KIND.app
            return (
              <div key={p.pid} className="flex items-center gap-2 text-[11px]">
                <span className="text-text-muted w-20 truncate" title={p.cmd}>{p.name}</span>
                <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${k.bg} ${k.cls}`}>{k.label}</span>
                <span className="text-text flex-1 text-right">{fmtMb(p.rssMb)}</span>
                <span className="text-text-muted w-16 text-right">{fmtElapsed(p.elapsedSec)}</span>
              </div>
            )
          })}
          <div className="text-[10px] text-text-muted/80 pt-0.5">
            это процессы, а не сессии агентов — сессии считаются в карточке выше
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2.5">
        <button onClick={() => setOpen(v => !v)}
          className="px-2.5 py-1 rounded-lg border border-border text-[11px] text-text-muted hover:text-text">
          {open ? 'Свернуть' : 'Весь список'}
        </button>
        <button onClick={load} className="px-2.5 py-1 rounded-lg border border-border text-[11px] text-text-muted hover:text-text">
          Обновить
        </button>
      </div>

      {open && (
        <div className="mt-3 -mx-1">
          <ProcessesTable data={data} busy={busy} kill={kill} />
        </div>
      )}
    </div>
  )
}

// Таблица и фильтры — общая часть для полного вида и раскрытия в карточке.
function ProcessesTable({ data, busy, kill }) {
  const [filter, setFilter] = useState('all')
  const [onlyMine, setOnlyMine] = useState(false)

  const list = useMemo(() => {
    let l = data?.processes || []
    if (filter === 'suspicious') l = l.filter(p => p.flags.length)
    else if (filter === 'app') l = l.filter(p => p.kind === 'app')
    else if (filter === 'agent') l = l.filter(p => p.kind === 'agent')
    if (onlyMine) l = l.filter(p => p.canKill)
    return l
  }, [data, filter, onlyMine])

  const s = data?.stats

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
          {p.note && (
            <div className="text-[10px] text-text-muted/80 mt-0.5" title="Это не мусор: служба просто не перезапущена после обновления пакета">
              {p.note}
            </div>
          )}
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

  if (!data) {
    return (
      <div className="glass p-4 rounded-xl">
        <EmptyState icon="Activity" mascot="idle" title="Читаю список процессов…" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          ['all', 'Все'],
          ['suspicious', 'С метками'],
          ['app', 'Программы'],
          ['agent', 'Агенты'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              filter === id ? 'bg-accent text-white' : 'text-text-muted hover:text-text hover:bg-bg-elevated'
            }`}>
            {label}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-[11px] text-text-muted ml-1 cursor-pointer">
          <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
          только завершаемые
        </label>
        <span className="ml-auto text-[11px] text-text-muted">{list.length} шт</span>
      </div>

      {list.length === 0 ? (
        <div className="glass p-3 rounded-xl">
          <EmptyState icon="CheckCircle" mascot="ok" title="Пусто"
            hint={onlyMine
              ? 'Ничего нельзя завершить: всё либо системное, либо сама панель.'
              : 'Под этот фильтр ничего не попало.'} />
        </div>
      ) : (
        <div className="glass p-1 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-left text-[11px] text-text-muted">
                <th className="py-1.5 px-2 font-medium">Процесс</th>
                <th className="py-1.5 px-2 font-medium">PID</th>
                <th className="py-1.5 px-2 font-medium">Память</th>
                <th className="py-1.5 px-2 font-medium">Работает</th>
                <th className="py-1.5 px-2 font-medium text-right">Действие</th>
              </tr>
            </thead>
            <tbody>{list.map(row)}</tbody>
          </table>
        </div>
      )}

      {s?.staleServices > 0 && (
        <div className="text-[10px] text-text-muted/80 px-1">
          {s.staleServices} служб работают со старой версией после обновления — это не мусор,
          перезапустятся при перезагрузке.
        </div>
      )}
    </div>
  )
}
