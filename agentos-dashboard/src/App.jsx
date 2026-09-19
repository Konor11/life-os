import React, { useState, useEffect } from 'react'
import { AppShell, Header, Sidebar, MainContent, AgentCard, PlanView, TasksView, KnowledgeView, HabitsView, StatusBar, DesktopView, AgentsView, AutomationsView, SystemStrip, KeysView, HarnessView } from './components'
import { fetchAll, savePlan, saveTasks, saveNotes, saveHabits } from './data/api'

const emptyPlan = { date: new Date().toISOString().slice(0,10), timeBlocks: [], priorities: [], metrics: { deepWorkHours: 0, meetingsHours: 0 } }
const emptyTasks = []
const emptyNotes = []
const emptyHabits = []

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
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [sysStatus, setSysStatus] = useState(null)

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(d => setSysStatus(d)).catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    fetchAll()
      .then(d => { if (!active) return; if (d.plan) setPlan(d.plan); if (d.tasks) setTasks(d.tasks); if (d.notes) setNotes(d.notes); if (d.habits) setHabits(d.habits) })
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
              {activeView === 'plan' && <PlanView plan={plan} onUpdate={(p) => { setPlan(p); savePlan(p).catch(e => console.error(e)) }} />}
              {activeView === 'tasks' && <TasksView tasks={tasks} onUpdate={(t) => { setTasks(t); saveTasks(t).catch(e => console.error(e)) }} />}
              {activeView === 'knowledge' && <KnowledgeView notes={notes} onUpdate={(n) => { setNotes(n); saveNotes(n).catch(e => console.error(e)) }} />}
              {activeView === 'habits' && <HabitsView habits={habits} onUpdate={(h) => { setHabits(h); saveHabits(h).catch(e => console.error(e)) }} />}
              {activeView === 'desktop' && <DesktopView />}
              {activeView === 'agents' && <AgentsView />}
              {activeView === 'automations' && <AutomationsView />}
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