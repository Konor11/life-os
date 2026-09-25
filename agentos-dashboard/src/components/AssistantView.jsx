import { useState, useEffect, useRef } from 'react'
import { askAgent, askDomainAgent } from '../data/api'
import { Icon } from './Icons'

const AGENTS = [
  { id: 'coordinator', label: 'Orchestrator', icon: 'Brain', desc: 'Общий координатор — распределяет задачи между субагентами', model: 'nemotron' },
  { id: 'planner', label: 'Planner', icon: 'Calendar', desc: 'Планирование дня и недели, тайм-блокинг' },
  { id: 'tasks', label: 'Tasks', icon: 'CheckSquare', desc: 'GTD, задачи и проекты' },
  { id: 'knowledge', label: 'Knowledge', icon: 'BookOpen', desc: 'База знаний, заметки, Zettelkasten' },
  { id: 'habits', label: 'Habits', icon: 'Target', desc: 'Привычки, стрики, рутины' },
  { id: 'finances', label: 'Finances', icon: 'Wallet', desc: 'Финансы, бюджеты, счета' },
  { id: 'health', label: 'Health', icon: 'Heart', desc: 'Здоровье, тренировки, сон' },
  { id: 'learning', label: 'Learning', icon: 'GraduationCap', desc: 'Обучение, курсы, прогресс' },
  { id: 'contacts', label: 'Contacts', icon: 'Users', desc: 'Контакты и CRM' },
  { id: 'automations', label: 'Automations', icon: 'Zap', desc: 'Автоматизации и воркфлоу' },
  { id: 'calendar', label: 'Calendar', icon: 'Calendar', desc: 'Календарь и события' },
  { id: 'projects', label: 'Projects', icon: 'Folder', desc: 'Проекты и Канбан' },
]

const WELCOME = [
  { role: 'assistant', content: 'Привет! Я Life OS — твой ИИ-ассистент. Выбери субагента слева и задай вопрос, или просто спроси меня — я распределю задачу между специалистами. Из чего начнём?', agent: 'coordinator' },
]

export function AssistantView() {
  const [agent, setAgent] = useState('coordinator')
  const [messages, setMessages] = useState(WELCOME)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState(null)
  const [quickReplies, setQuickReplies] = useState([
    'Спланируй мой день',
    'Что у меня с финансами?',
    'Дай совет для продуктивности',
    'Проверь мои привычки',
  ])
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = async (text) => {
    const q = (text ?? input).trim()
    if (!q || isTyping) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q, agent }])
    setIsTyping(true)
    setError(null)
    try {
      let answer
      if (agent === 'coordinator') {
        answer = await askAgent('coordinator', q)
      } else if (agent === 'planner' || agent === 'knowledge' || agent === 'tasks' || agent === 'habits') {
        const profileMap = { planner: 'planner', knowledge: 'knowledge', tasks: 'tasks', habits: 'habits' }
        answer = await askAgent(profileMap[agent], q)
      } else {
        answer = await askDomainAgent(agent, q)
      }
      setMessages(prev => [...prev, { role: 'assistant', content: answer.answer || '(пустой ответ)', agent }])
      setQuickReplies(prev => {
        const next = ['Ещё', 'Расскажи подробнее', 'Что дальше?']
        return next
      })
    } catch (e) {
      setError(e.message || 'Ошибка связи с сервером')
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Ошибка: ${e.message}`, agent }])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] h-[calc(100dvh-9rem)] gap-4 min-h-[600px]">
      {/* Agent roster */}
      <div className="glass p-3 rounded-xl overflow-y-auto">
        <h3 className="font-semibold text-text text-sm mb-3 flex items-center gap-2"><Icon name="Brain" size={16} /> Субагенты</h3>
        {AGENTS.map(a => (
          <button key={a.id} onClick={() => { setAgent(a.id); setMessages([...WELCOME, { role: 'assistant', content: `Переключился на **${a.label}**. ${a.desc}. Что делаем?`, agent: a.id }]) }}
            className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors border ${agent === a.id ? 'bg-accent/10 border-accent' : 'bg-transparent border-border hover:bg-bg-elevated/50'}`}>
            <div className="flex items-center gap-2">
              <Icon name={a.icon} size={16} className={agent === a.id ? 'text-accent' : 'text-text-muted'} />
              <span className={`text-sm font-medium ${agent === a.id ? 'text-accent' : 'text-text'}`}>{a.label}</span>
            </div>
            <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{a.desc}</p>
          </button>
        ))}
      </div>

      {/* Chat pane */}
      <div className="glass rounded-xl flex flex-col min-h-[600px]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-elevated/40">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-accent/15`}>
            <Icon name={AGENTS.find(a => a.id === agent)?.icon || 'Brain'} size={18} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text text-sm">{AGENTS.find(a => a.id === agent)?.label}</h3>
            <p className="text-xs text-text-muted truncate">{AGENTS.find(a => a.id === agent)?.desc}</p>
          </div>
          <span className="text-xs px-2 py-1 rounded bg-success/10 text-success flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Online
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[440px]">
          {messages.map((m, i) => (
            <ChatBubble key={i} msg={m} agent={AGENTS.find(a => a.id === m.agent)} />
          ))}
          {isTyping && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent"><Icon name="Brain" size={16} /></div>
              <div className="glass px-4 py-2.5 rounded-2xl flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '120ms' }} />
                <span className="w-2 h-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '240ms' }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick replies */}
        {quickReplies.length > 0 && !isTyping && (
          <div className="flex flex-wrap gap-2 px-4 mb-2">
            {quickReplies.map(q => (
              <button key={q} onClick={() => handleSend(q)} className="px-3 py-1.5 text-xs border border-border rounded-full hover:bg-bg-elevated/50 hover:border-accent/40 text-text-muted">{q}</button>
            ))}
          </div>
        )}

        {/* Composer */}
        <div className="flex items-center gap-3 px-4 pb-3 border-t border-border pt-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={`Спросить ${AGENTS.find(a => a.id === agent)?.label}...`}
            className="flex-1 input"
            disabled={isTyping}
          />
          <button onClick={() => handleSend()} disabled={isTyping || !input.trim()} className="w-10 h-10 rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 flex items-center justify-center transition-colors">
            <Icon name="Send" size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ msg, agent }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-accent/15 text-text px-4 py-2.5 whitespace-pre-wrap">{msg.content}</div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${agent ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-text-muted'}`}>
        <Icon name={agent?.icon || 'Brain'} size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-accent font-medium mb-1 flex items-center gap-1">
          {agent?.label || 'Assistant'}
          <span className="text-text-muted">· {agent?.model || ''}</span>
        </div>
        <div className="glass px-4 py-2.5 rounded-2xl text-text whitespace-pre-wrap">{msg.content}</div>
      </div>
    </div>
  )
}