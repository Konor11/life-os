import { useState, useRef, useEffect } from 'react'
import { Icon } from '../Icons'
import { AgentInstrument } from './AgentInstrument'

const INSTRUMENTS = [
  {
    id: 'apollo',
    title: 'Apollo — Голосовой агент',
    subtitle: 'Голосом → текст → ответ агента',
    description: 'Нажми микрофон, говори — агент распознает речь и ответит. Как голосовой агент Apollo из видео автора.',
    agent: 'coordinator',
    fields: [
      { name: 'voiceInput', label: 'Голосовой ввод', type: 'text', placeholder: 'нажми кнопку микрофона и говори...' },
      { name: 'question', label: 'Или введи текстом', type: 'textarea', rows: 2, placeholder: 'например: что в моём плане на сегодня?' },
    ],
    promptTemplate: `Ответь агенту на запрос пользователя: {voiceInput} {question}\nОтвечай кратко, полезно, на русском.`,
    submitLabel: 'Спросить агента',
    outputTitle: 'Ответ Apollo',
  },
  {
    id: 'planner',
    title: 'Планировщик дня',
    subtitle: 'Задачи + приоритеты → готовый план',
    description: 'Как SEO-агент автора, но для личной продуктивности: вводишь задачи и контекст, получаешь план.',
    agent: 'planner',
    fields: [
      { name: 'tasks', label: 'Задачи на день (через запятую)', type: 'textarea', rows: 2, placeholder: 'написать отчёт, тренировка, созвон с командой...' },
      { name: 'starts', label: 'Рабочий день начинается в...', placeholder: '09:00' },
      { name: 'context', label: 'Контекст / цели (необязательно)', type: 'textarea', rows: 2, placeholder: 'важная встреча в 16:00, хочу 3 часа глубокой работы' },
    ],
    promptTemplate: `Составь тайм-блокированный план на день.
Задачи: {tasks}
Начало дня: {starts}
Контекст: {context}

Верни structured план: список временных блоков (время + задача + тип), приоритеты 1-3-5, и метрики глубокой работы. Кратко и по делу.`,
    submitLabel: 'Создать план дня',
    outputTitle: 'План дня',
  },
  {
    id: 'notes',
    title: 'Заметочник (Second Brain)',
    subtitle: 'Тема → структурированная заметка',
    description: 'Вводишь тему — агент Knowledge возвращает структурированную заметку с тегами и выжимкой, готовую в базу.',
    agent: 'knowledge',
    fields: [
      { name: 'topic', label: 'Тема заметки', placeholder: 'Принципы тайм-блокинга' },
      { name: 'extra', label: 'Доп. контекст (необязательно)', type: 'textarea', rows: 2, placeholder: 'что уже знаю, примеры, источники...' },
    ],
    promptTemplate: `Создай структурированную заметку для базы знаний (Zettelkasten).
Тема: {topic}
Дополнительный контекст: {extra}

Верни: заголовок, теги (3-5), краткую выжимку, разделы с ключевыми пунктами, и ссылки-ассоциации. На русском.`,
    submitLabel: 'Создать заметку',
    outputTitle: 'Заметка',
  },
  {
    id: 'seo',
    title: 'SEO-агент',
    subtitle: 'Keyword + case study → контент',
    description: 'Прямо как у автора: вводишь ключевое слово и кейс-стади, получаешь готовый контент/структуру уникальных статей.',
    agent: 'coordinator',
    defaultMode: 'agent',
    fields: [
      { name: 'keyword', label: 'Ключевое слово', placeholder: 'например: Agent' },
      { name: 'caseStudy', label: 'Case study / уникальная информация', type: 'textarea', rows: 3, placeholder: 'что уникального именно у тебя по этой теме...' },
      { name: 'count', label: 'Сколько статей', placeholder: '5' },
    ],
    promptTemplate: `Ты SEO-агент. Сгенерируй {count} уникальные статьи по ключевому слову "{keyword}".
Уникальный контекст/кейс: {caseStudy}

Для каждой статьи: заголовок (H1), мета-описание, 3-5 подзаголовков (H2), ключевые пункты. Контент должен быть уникальным и учитывать кейс. На русском.`,
    submitLabel: 'Generate articles',
    outputTitle: 'Статьи',
  },
  {
    id: 'habits',
    title: 'Привычка-трекер',
    subtitle: 'Мета → план привычки',
    description: 'Опиши, что хочешь наработать — агент Habits вернёт identity-формулу, micro-привычку и стек.',
    agent: 'habits',
    fields: [
      { name: 'goal', label: 'Что хочешь наработать', placeholder: 'читать каждый день по 30 минут' },
      { name: 'after', label: 'После какого существующего ритуала', placeholder: 'после утреннего кофе' },
    ],
    promptTemplate: `Помоги спроектировать привычку.
Цель: {goal}
Стек после: {after}

Верни: identity-фразу ("Я — человек, который..."), микро-версию (2 мин), шаги внедрения, как трекать, когда ждать результат. На русском, кратко.`,
    submitLabel: 'Спроектировать привычку',
    outputTitle: 'План привычки',
  },
  {
    id: 'analyst',
    title: 'Аналитик',
    subtitle: 'Данные → выводы',
    description: 'Вставь данные/текст — агент переработает в выводы и рекомендации.',
    agent: 'coordinator',
    defaultMode: 'agent',
    fields: [
      { name: 'data', label: 'Данные / текст', type: 'textarea', rows: 4, placeholder: 'вставь метрики, лог, отчёт...' },
      { name: 'question', label: 'Что анализируем', placeholder: 'что улучшить в следующей неделе' },
    ],
    promptTemplate: `Проанализируй следующее и дай выводы.
Данные: {data}
Вопрос: {question}

Верни: ключевые выводы (маркированный список), паттерны/тренды, 3 рекомендации, что учесть. На русском, по делу.`,
    submitLabel: 'Анализировать',
    outputTitle: 'Анализ',
  },
]

export function AgentsView() {
  const [active, setActive] = useState('planner')
  const instrument = INSTRUMENTS.find(i => i.id === active)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Agent Tools</h1>
          <p className="text-text-muted">Агент-инструменты: вводишь поля → нажимаешь кнопку → получаешь готовый результат.</p>
        </div>

        {/* instrument picker */}
        <div className="overflow-x-auto pb-1">
          <div className="flex gap-2">
            {INSTRUMENTS.map(i => (
              <button
                key={i.id}
                onClick={() => setActive(i.id)}
                className={`px-4 py-2 rounded-xl text-sm border transition-all whitespace-nowrap ${
                  active===i.id ? 'text-white' : 'text-text-muted hover:text-text hover:border-border-hover'
                }`}
                style={active===i.id ? { background: 'linear-gradient(180deg,#6a7bff,#5865f2)', borderColor: 'transparent' } : {}}
              >
                <span className="mr-1.5">✦</span>{i.title}
              </button>
            ))}
          </div>
        </div>

        {/* active instrument */}
        <AgentInstrument key={instrument.id} {...instrument} />
      </div>
    </div>
  )
}