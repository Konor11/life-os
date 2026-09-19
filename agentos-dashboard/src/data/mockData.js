export const mockPlan = {
  date: '2026-09-16',
  timeBlocks: [
    { id: '1', startHour: 6, endHour: 7, type: 'ritual', label: 'Утренний ритуал', color: 'success' },
    { id: '2', startHour: 7, endHour: 8, type: 'buffer', label: 'Завтрак / путь', color: 'warning' },
    { id: '3', startHour: 8, endHour: 9, type: 'shallow', label: 'Email / админ', color: 'border' },
    { id: '4', startHour: 9, endHour: 11, type: 'deep_work', label: 'Проект Alpha — архитектура', taskId: 'T-1', color: 'accent' },
    { id: '5', startHour: 11, endHour: 11.25, type: 'buffer', label: 'Перерыв', color: 'warning' },
    { id: '6', startHour: 11.25, endHour: 13, type: 'deep_work', label: 'Проект Beta — API дизайн', taskId: 'T-2', color: 'accent' },
    { id: '7', startHour: 13, endHour: 14, type: 'buffer', label: 'Обед / прогулка', color: 'warning' },
    { id: '8', startHour: 14, endHour: 15.5, type: 'shallow', label: 'Встречи / созвоны', color: 'border' },
    { id: '9', startHour: 15.5, endHour: 16, type: 'buffer', label: 'Перерыв', color: 'warning' },
    { id: '10', startHour: 16, endHour: 17.5, type: 'deep_work', label: 'Код-ревью / рефакторинг', taskId: 'T-3', color: 'accent' },
    { id: '11', startHour: 17.5, endHour: 18, type: 'ritual', label: 'Вечерний ритуал', color: 'success' },
  ],
  priorities: [
    'Завершить архитектуру Проекта Alpha',
    'Согласовать API Проекта Beta',
    'Проверить PR #234',
  ],
  metrics: {
    deepWorkHours: 5.5,
    meetingsHours: 1.5,
    shallowHours: 2,
  }
}

export const mockTasks = [
  { id: 'T-1', title: 'Архитектура Проекта Alpha', project: 'Project Alpha', status: 'in-progress', priority: 'high', context: '@computer', dueDate: '2026-09-18', nextAction: true },
  { id: 'T-2', title: 'API дизайн Проекта Beta', project: 'Project Beta', status: 'ready', priority: 'high', context: '@computer', dueDate: '2026-09-20', nextAction: true },
  { id: 'T-3', title: 'Код-ревью PR #234', project: 'Platform', status: 'waiting', priority: 'medium', context: '@computer', dueDate: '2026-09-16', nextAction: false },
  { id: 'T-4', title: 'Написать тесты для auth модуля', project: 'Platform', status: 'backlog', priority: 'medium', context: '@computer', dueDate: '2026-09-22', nextAction: false },
  { id: 'T-5', title: 'Обновить документацию API', project: 'Project Beta', status: 'backlog', priority: 'low', context: '@computer', dueDate: '2026-09-25', nextAction: false },
  { id: 'T-6', title: 'Купить домен для нового проекта', project: 'Personal', status: 'ready', priority: 'low', context: '@phone', dueDate: '2026-09-17', nextAction: true },
  { id: 'T-7', title: 'Встреча с командой дизайн', project: 'Project Alpha', status: 'scheduled', priority: 'high', context: '@meeting', dueDate: '2026-09-16', nextAction: false },
]

export const mockNotes = [
  { id: 'N-1', title: 'Принципы тайм-блокинга', type: 'permanent', tags: ['productivity', 'planning'], updated: '2026-09-14', excerpt: 'Выделяй непрерывные блоки 90-120 мин для глубокой работы. Буферы 15 мин между блоками...' },
  { id: 'N-2', title: 'Архитектурные решения Alpha', type: 'project', tags: ['architecture', 'alpha'], updated: '2026-09-15', excerpt: 'Микросервисы vs модульный монолит. Выбрали модульный монолит с четкими границами...' },
  { id: 'N-3', title: 'Встреча с командой 15.09', type: 'meeting', tags: ['meeting', 'alpha'], updated: '2026-09-15', excerpt: 'Обсудили timeline Q4. Решили отложить фичу X на Q1. Новый deadline Alpha — 15 октября...' },
  { id: 'N-4', title: 'Паттерны React Query', type: 'reference', tags: ['react', 'patterns'], updated: '2026-09-10', excerpt: 'useQuery для GET, useMutation для POST/PUT/DELETE. invalidateQueries после мутаций...' },
]

export const mockHabits = [
  { id: 'H-1', name: 'Утренняя разминка', identity: 'Я — человек, который движется каждое утро', streak: 12, bestStreak: 21, frequency: 'daily', timeBlock: '06:00-06:15', lastDone: '2026-09-15', metrics: { duration: 15, quality: 8 } },
  { id: 'H-2', name: 'Глубокая работа 9-11', identity: 'Я — фокусированный создатель', streak: 8, bestStreak: 14, frequency: 'weekdays', timeBlock: '09:00-11:00', lastDone: '2026-09-15', metrics: { duration: 120, quality: 9 } },
  { id: 'H-3', name: 'Чтение 30 мин', identity: 'Я — человек, который учится каждый день', streak: 23, bestStreak: 45, frequency: 'daily', timeBlock: '22:00-22:30', lastDone: '2026-09-15', metrics: { duration: 30, quality: 7 } },
  { id: 'H-4', name: 'Вечерний журнал', identity: 'Я — рефлексирующий практик', streak: 5, bestStreak: 30, frequency: 'daily', timeBlock: '22:30-22:40', lastDone: '2026-09-15', metrics: { duration: 10, quality: 8 } },
  { id: 'H-5', name: 'Вода 2.5л', identity: 'Я — гидратированный человек', streak: 3, bestStreak: 14, frequency: 'daily', timeBlock: 'all day', lastDone: '2026-09-14', metrics: { liters: 1.8, quality: 6 } },
]