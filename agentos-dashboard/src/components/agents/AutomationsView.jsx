import { useState, useEffect } from 'react'
import { Icon } from '../Icons'

const API = '/api'
const CRON_NAMESPACE = 'lifeos-agent-oracle'

const PRESETS = [
  {
    id: 'oracle-news',
    title: 'Oracle — Менеджер новостей',
    desc: 'Каждое утро в 8:00 тянет свежие новости по теме и сохраняет в заметки.',
    defaultCron: '0 8 * * *',
    agent: 'coordinator',
    prompt: 'Собери свежие новости по темам пользователя (мысли о продуктивности, AI). Верни краткий дайджест: 5 ключевых пунктов. На русском.',
  },
  {
    id: 'muse-content',
    title: 'Muse — Анализ контента',
    desc: 'Раз в день анализирует заметки/задачи и предлагает новые идеи контента.',
    defaultCron: '0 18 * * *',
    agent: 'knowledge',
    prompt: 'Проанализируй мои заметки и дай 5 новых идей для контента на основе того, что работает. Кратко, на русском.',
  },
  {
    id: 'asteros-compete',
    title: 'Asteros — Конкуренты',
    desc: 'Еженедельно смотрит обсуждения/конкурентов и даёт контент-идеи.',
    defaultCron: '0 9 * * 1',
    agent: 'coordinator',
    prompt: 'Придумай 5 контент-идей на основе трендов в нише пользователя. Кратко, на русском.',
  },
  {
    id: 'planner-daily',
    title: 'Планировщик дня',
    desc: 'Каждое утро генерирует план дня на основе задач.',
    defaultCron: '30 7 * * *',
    agent: 'planner',
    prompt: 'Составь план на сегодня на основе актуальных задач и привычек. Краткий тайм-блокинг. На русском.',
  },
]

export function AutomationsView() {
  const [automations, setAutomations] = useState([])
  const [status, setStatus] = useState('Загрузка...')
  const [busy, setBusy] = useState(null)

  const list = async () => {
    try {
      // Hermes cron CLI: hermes cron list
      const r = await fetch(`${API}/terminal`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ command: `hermes cron list --json 2>/dev/null || hermes cron list 2>/dev/null || echo '[]'`, cwd:'/root' }) })
      const d = await r.json()
      setStatus(d.output?.trim().slice(0, 200) || 'нет расписаний')
      setAutomations([]) // управляем через presets; real state приходит в вывод.
    } catch (e) { setStatus(`ERR: ${e.message}`) }
  }
  useEffect(() => { list() }, [])

  const runNow = async (id) => {
    const p = PRESETS.find(x => x.id === id)
    if (!p || busy) return
    setBusy(id)
    try {
      const r = await fetch(`${API}/agent`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ profile: p.agent, message: p.prompt }) })
      const d = await r.json()
      // save result to notes
      const nr = await fetch(`${API}/notes`); const all = await nr.json() || []
      const note = { id:`N-${Date.now()}`, title:`${p.title} — ${new Date().toISOString().slice(0,10)}`, type:'automation', tags:['automation', p.id, p.agent], content:d.answer||'', excerpt:(d.answer||'').slice(0,120), updated:new Date().toISOString().slice(0,10) }
      await fetch(`${API}/notes`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify([note, ...all]) })
    } catch (e) { alert(e.message) }
    setBusy(null)
    list()
  }

  const createCron = async (p) => {
    const env = `HERMES_HOME=/root`
    const cmd = `export ${env} OPENROUTER_API_KEY=<<KEY_IN_ENV>>; hermes cron add --name '${p.id}' --schedule "${p.defaultCron}" --profile ${p.agent} --command "hermes -p ${p.agent} chat -q \\"${p.prompt.slice(0,80)}\\" --output-save-note" 2>&1 || echo 'cron add unsupported here'`
    try {
      const r = await fetch(`${API}/terminal`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ command: cmd, cwd:'/root' }) })
      setStatus(r.output || 'ok')
    } catch (e) { setStatus(e.message) }
    list()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Automations</h1>
        <p className="text-text-muted">Автоматизации в стиле Agent OS: Oracle/Muse/Asteros — запусти вручную или через cron по расписанию.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PRESETS.map(p => (
          <div key={p.id} className="glass rounded-xl p-4 flex flex-col"
            style={{ borderLeft: '3px solid #5865f2' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-text">{p.title}</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-bg-elevated text-text-muted font-mono">{p.defaultCron}</span>
            </div>
            <p className="text-xs text-text-muted mb-3">{p.desc}</p>
            <div className="flex gap-2 mt-auto">
              <button onClick={() => runNow(p.id)} disabled={busy}
                className={`flex-1 py-2 rounded-lg text-white disabled:opacity-50 ${busy===p.id ? 'opacity-70' : ''}`}
                style={{ background:'#5865f2' }}>
                {busy===p.id ? 'Работает...' : '▶ Запустить сейчас'}
              </button>
              <button onClick={() => createCron(p)}
                className="px-3 py-2 rounded-lg border border-border text-text-muted hover:text-text hover:bg-bg-elevated"
                title="Создать cron-расписание">🗓 cron</button>
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-text">Статус cron</h3>
          <button onClick={list} className="px-3 py-1 rounded text-xs border border-border text-text-muted hover:text-text">⟳ refresh</button>
        </div>
        <pre className="bg-black/70 rounded-lg p-3 overflow-auto max-h-[220px] text-xs text-text-muted whitespace-pre-wrap break-words">{status}</pre>
      </div>
    </div>
  )
}