import React, { useState, useEffect, Suspense, lazy } from 'react'
import { AppShell, Header, Sidebar, MainContent, AgentCard, PlanView, TasksView, KnowledgeView, HabitsView, StatusBar, DesktopView, AgentsView, SystemStrip, KeysView, HarnessView } from './components'
import { fetchAll, savePlan, saveTasks, saveNotes, saveHabits, saveFinances, saveHealth, saveLearning, saveContacts, saveAutomations, saveMemory, saveCalendar } from './data/api'

// Lazy-load all new views to force chunk creation and prevent tree-shaking
const FinancesView = lazy(() => import('./components/FinancesView').then(m => ({ default: m.FinancesView })))
const HealthView = lazy(() => import('./components/HealthView').then(m => ({ default: m.HealthView })))
const LearningView = lazy(() => import('./components/LearningView').then(m => ({ default: m.LearningView })))
const ContactsView = lazy(() => import('./components/ContactsView').then(m => ({ default: m.ContactsView })))
const AutomationsDashboardView = lazy(() => import('./components/AutomationsDashboardView').then(m => ({ default: m.AutomationsDashboardView })))
const MemoryView = lazy(() => import('./components/MemoryView').then(m => ({ default: m.MemoryView })))
const CalendarView = lazy(() => import('./components/CalendarView').then(m => ({ default: m.CalendarView })))

const emptyPlan = { date: new Date().toISOString().slice(0,10), timeBlocks: [], priorities: [], metrics: { deepWorkHours: 0, meetingsHours: 0 } }
const emptyTasks = []
const emptyNotes = []
const emptyHabits = []
const emptyFinances = { accounts: [], transactions: [], budgets: [], goals: [] }
const emptyHealth = { metrics: [], workouts: [], sleep: [], nutrition: [], appointments: [] }
const emptyLearning = { courses: [], topics: [], progress: [], resources: [] }
const emptyContacts = { people: [], organizations: [], interactions: [], tags: [] }
const emptyAutomations = { workflows: [], triggers: [], runs: [] }
const emptyMemory = { documents: [], embeddings: [], queries: [] }
const emptyCalendar = { events: [], calendars: [] }

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, errorInfo: null } }
  static getDerivedStateFromError(error) { return { hasError: true } }
  componentDidCatch(error, errorInfo) { console.error('ErrorBoundary caught:', error, errorInfo); this.setState({ error, errorInfo }) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'24px', background:'#0a0e1a', color:'#e7e9ee', fontFamily:'system-ui, sans-serif' }}>
          <div style={{ background:'#171a21', border:'1px solid #ef4444', borderRadius:'12px', padding:'32px', maxWidth:'600px', width:'90%', textAlign:'left' }}>
            <h2 style={{ color:'#ef4444', margin:'0 0 16px' }}>Application Error</h2>
            <p style={{ color:'#8a8f9c', margin:'0 0 16px' }}>Something went wrong. Error logged to console.</p>
            <details style={{ marginTop:'16px', color:'#8a8f9c' }}>
              <summary style={{ cursor:'pointer', marginBottom:'8px' }}>Error Details</summary>
              <pre style={{ background:'#1a1a2e', padding:'16px', borderRadius:'8px', overflow:'auto', maxHeight:'300px', fontSize:'12px', color:'#e7e9ee' }}>
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
            <button onClick={() => window.location.reload()} style={{ marginTop:'24px', padding:'12px 24px', background:'#5865f2', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', width:'100%' }}>Reload Application</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const [plan, setPlan] = useState(emptyPlan)
  const [tasks, setTasks] = useState(emptyTasks)
  const [notes, setNotes] = useState(emptyNotes)
  const [habits, setHabits] = useState(emptyHabits)
  const [finances, setFinances] = useState(emptyFinances)
  const [health, setHealth] = useState(emptyHealth)
  const [learning, setLearning] = useState(emptyLearning)
  const [contacts, setContacts] = useState(emptyContacts)
  const [automations, setAutomations] = useState(emptyAutomations)
  const [memory, setMemory] = useState(emptyMemory)
  const [calendar, setCalendar] = useState(emptyCalendar)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [sysStatus, setSysStatus] = useState(null)
  // Live mirror of all domain data — lets onUpdate handlers accept both values and updater functions
  const dataRef = React.useRef({ plan: emptyPlan, tasks: emptyTasks, notes: emptyNotes, habits: emptyHabits, finances: emptyFinances, health: emptyHealth, learning: emptyLearning, contacts: emptyContacts, automations: emptyAutomations, memory: emptyMemory, calendar: emptyCalendar })
  const makeUpdate = (key, setter, saver) => (v) => {
    const next = typeof v === 'function' ? v(dataRef.current[key]) : v
    dataRef.current[key] = next
    setter(next)
    if (saver) saver(next).catch(e => console.error(`Save ${key} failed:`, e))
  }
  const updatePlan = makeUpdate('plan', setPlan, savePlan)
  const updateTasks = makeUpdate('tasks', setTasks, saveTasks)
  const updateNotes = makeUpdate('notes', setNotes, saveNotes)
  const updateHabits = makeUpdate('habits', setHabits, saveHabits)
  const updateFinances = makeUpdate('finances', setFinances, saveFinances)
  const updateHealth = makeUpdate('health', setHealth, saveHealth)
  const updateLearning = makeUpdate('learning', setLearning, saveLearning)
  const updateContacts = makeUpdate('contacts', setContacts, saveContacts)
  const updateAutomations = makeUpdate('automations', setAutomations, saveAutomations)
  const updateMemory = makeUpdate('memory', setMemory, saveMemory)
  const updateCalendar = makeUpdate('calendar', setCalendar, saveCalendar)

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(d => setSysStatus(d)).catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    fetchAll()
      .then(d => {
        if (!active) return
        if (d.plan) { setPlan(d.plan); dataRef.current.plan = d.plan }
        if (d.tasks) { setTasks(d.tasks); dataRef.current.tasks = d.tasks }
        if (d.notes) { setNotes(d.notes); dataRef.current.notes = d.notes }
        if (d.habits) { setHabits(d.habits); dataRef.current.habits = d.habits }
        if (d.finances) { setFinances(d.finances); dataRef.current.finances = d.finances }
        if (d.health) { setHealth(d.health); dataRef.current.health = d.health }
        if (d.learning) { setLearning(d.learning); dataRef.current.learning = d.learning }
        if (d.contacts) { setContacts(d.contacts); dataRef.current.contacts = d.contacts }
        if (d.automations) { setAutomations(d.automations); dataRef.current.automations = d.automations }
        if (d.calendar) { setCalendar(d.calendar); dataRef.current.calendar = d.calendar }
      })
      .catch(e => { if (active) { console.error('API load failed:', e); setApiError(e.message) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#0a0e1a', color:'#5865f2', fontFamily:'system-ui' }}>
        Loading Life OS...
      </div>
    )
  }

  const stats = {
    tasksPending: tasks.filter(t => t.status !== 'done').length,
    habitsActive: habits.filter(h => h.streak > 0).length,
    notesCount: notes.length,
    deepWorkToday: (plan.timeBlocks || []).filter(b => b.type === 'deep_work').reduce((s,b) => s + (b.endHour - b.startHour), 0),
  }

  return (
    <ErrorBoundary>
      <AppShell
        sidebarRender={(<Sidebar activeView={activeView} onViewChange={setActiveView} stats={stats} />)}
        mainRender={(
          <>
            <Header activeView={activeView} onViewChange={setActiveView} />
            <MainContent>
              {apiError && (
                <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid #ef4444', color:'#fca5a5', padding:'12px 16px', borderRadius:'8px', marginBottom:'16px', fontSize:'13px' }}>
                  ⚠ Backend unavailable: {apiError} — showing in-memory data. Actions won't persist until backend is up.
                </div>
              )}
              {activeView === 'dashboard' && (
                <>
                <SystemStrip status={sysStatus} />
                <AgentCard
                  plan={plan}
                  tasks={tasks.filter(t => t.status !== 'done').slice(0, 5)}
                  habits={habits.slice(0, 4)}
                  notes={notes.slice(0, 3)}
                  onQuickAction={() => {}}
                />
                </>
              )}
              {activeView === 'plan' && <PlanView plan={plan} onUpdate={updatePlan} />}
              {activeView === 'tasks' && <TasksView tasks={tasks} onUpdate={updateTasks} />}
              {activeView === 'knowledge' && <KnowledgeView notes={notes} onUpdate={updateNotes} />}
              {activeView === 'habits' && <HabitsView habits={habits} onUpdate={updateHabits} />}
              {activeView === 'finances' && <Suspense fallback={<div className="flex items-center justify-center h-32 text-text-muted">Loading Finances...</div>}><FinancesView finances={finances} onUpdate={updateFinances} /></Suspense>}
              {activeView === 'health' && <Suspense fallback={<div className="flex items-center justify-center h-32 text-text-muted">Loading Health...</div>}><HealthView health={health} onUpdate={updateHealth} /></Suspense>}
              {activeView === 'learning' && <Suspense fallback={<div className="flex items-center justify-center h-32 text-text-muted">Loading Learning...</div>}><LearningView learning={learning} onUpdate={updateLearning} /></Suspense>}
              {activeView === 'contacts' && <Suspense fallback={<div className="flex items-center justify-center h-32 text-text-muted">Loading Contacts...</div>}><ContactsView contacts={contacts} onUpdate={updateContacts} /></Suspense>}
              {activeView === 'automations' && <Suspense fallback={<div className="flex items-center justify-center h-32 text-text-muted">Loading Automations...</div>}><AutomationsDashboardView automations={automations} onUpdate={updateAutomations} /></Suspense>}
              {activeView === 'memory' && <Suspense fallback={<div className="flex items-center justify-center h-32 text-text-muted">Loading Memory...</div>}><MemoryView memory={memory} onUpdate={updateMemory} /></Suspense>}
              {activeView === 'calendar' && <Suspense fallback={<div className="flex items-center justify-center h-32 text-text-muted">Loading Calendar...</div>}><CalendarView calendar={calendar} onUpdate={updateCalendar} /></Suspense>}
              {activeView === 'desktop' && <DesktopView />}
              {activeView === 'agents' && <AgentsView />}
              {activeView === 'keys' && <KeysView />}
              {activeView === 'harness' && <HarnessView />}
            </MainContent>
            <StatusBar agents={[
              { id: 'planner', name: 'Planner', status: 'idle' },
              { id: 'tasks', name: 'Tasks', status: 'idle' },
              { id: 'knowledge', name: 'Knowledge', status: 'idle' },
              { id: 'habits', name: 'Habits', status: 'idle' },
            ]} />
          </>
        )}
      />
    </ErrorBoundary>
  )
}

export default App