import { useState } from 'react'
import { Icon } from './Icons'

const triggerTypes = ['schedule', 'webhook', 'manual', 'event', 'email', 'file_watch']
const actionTypes = ['http_request', 'run_script', 'send_email', 'create_task', 'send_notification', 'update_db', 'call_api']

export function AutomationsDashboardView({ automations, onUpdate }) {
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState('workflows')
  const [newWorkflow, setNewWorkflow] = useState({ name: '', description: '', trigger: { type: 'schedule', config: {} }, actions: [], enabled: true })
  const [editingId, setEditingId] = useState(null)

  const activeWorkflows = automations.workflows.filter(w => w.enabled).length
  const totalRuns = automations.runs.length
  const failedRuns = automations.runs.filter(r => r.status === 'failed').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Automations</h1>
          <p className="text-text-muted">Workflows • Triggers • Runs • Monitoring</p>
        </div>
        <button onClick={() => { setEditingId(null); setNewWorkflow({ name: '', description: '', trigger: { type: 'schedule', config: {} }, actions: [], enabled: true }); setShowForm(true); }} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
          <Icon name="Plus" size={18} />
          New Workflow
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Workflows" value={automations.workflows.length} icon="Workflow" color="accent" />
        <MetricCard label="Active" value={activeWorkflows} icon="Play" color="success" />
        <MetricCard label="Total Runs" value={totalRuns} icon="Repeat" color="warning" />
        <MetricCard label="Failed" value={failedRuns} icon="AlertCircle" color={failedRuns > 0 ? 'danger' : 'success'} />
      </div>

      <div className="flex items-center gap-2 border-b border-border mb-4">
        {['workflows', 'triggers', 'runs', 'templates'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'workflows' && <WorkflowList workflows={automations.workflows} onUpdate={onUpdate} onEdit={w => { setEditingId(w.id); setNewWorkflow(w); setShowForm(true); }} />}
      {activeTab === 'triggers' && <TriggerList triggers={automations.triggers} onUpdate={onUpdate} />}
      {activeTab === 'runs' && <RunList runs={automations.runs} onUpdate={onUpdate} />}
      {activeTab === 'templates' && <TemplateList onUpdate={onUpdate} onUse={t => { setEditingId(null); setNewWorkflow({ ...t, name: `${t.name} (copy)`, enabled: false }); setShowForm(true); }} />}

      {showForm && (
        <WorkflowForm
          workflow={newWorkflow}
          editing={editingId}
          onChange={setNewWorkflow}
          onSubmit={() => {
            if (newWorkflow.name && newWorkflow.actions.length > 0) {
              if (editingId) {
                onUpdate(a => ({ ...a, workflows: a.workflows.map(w => w.id === editingId ? { ...newWorkflow, id: editingId, updated: new Date().toISOString() } : w) }))
              } else {
                const w = { ...newWorkflow, id: `wf-${Date.now()}`, created: new Date().toISOString(), runs: 0, lastRun: null }
                onUpdate(a => ({ ...a, workflows: [w, ...a.workflows] }))
              }
            }
            setShowForm(false)
            setEditingId(null)
          }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}
    </div>
  )
}

function WorkflowList({ workflows, onUpdate, onEdit }) {
  const handleUpdate = (id, updates) => onUpdate(a => ({ ...a, workflows: a.workflows.map(w => w.id === id ? { ...w, ...(typeof updates === 'function' ? updates(w) : updates) } : w) }))
  const handleDelete = (id) => onUpdate(a => ({ ...a, workflows: a.workflows.filter(w => w.id !== id) }))
  const handleToggle = (id) => onUpdate(a => ({ ...a, workflows: a.workflows.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w) }))
  const handleRun = (id) => {
    handleUpdate(id, { status: 'running', lastRun: new Date().toISOString() })
    // Simulate run
    setTimeout(() => {
      const success = Math.random() > 0.2
      handleUpdate(id, (w) => ({ status: success ? 'success' : 'failed', runs: (w.runs || 0) + 1 }))
    }, 1000)
  }

  return (
    <div className="glass p-4 rounded-xl">
      {workflows.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Workflow" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No workflows yet. Create your first automation!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map(w => (
            <WorkflowCard key={w.id} workflow={w} onEdit={onEdit} onDelete={handleDelete} onToggle={handleToggle} onRun={handleRun} />
          ))}
        </div>
      )}
    </div>
  )
}

function WorkflowCard({ workflow, onEdit, onDelete, onToggle, onRun }) {
  return (
    <div className="glass p-4 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${workflow.enabled ? 'bg-success/10' : 'bg-border/50'}`}>
          <Icon name="Workflow" size={20} className={workflow.enabled ? 'text-success' : 'text-text-muted'} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-text truncate">{workflow.name}</h4>
            <span className={`text-xs px-2 py-0.5 rounded ${workflow.enabled ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
              {workflow.enabled ? 'Active' : 'Paused'}
            </span>
            <span className="text-xs text-text-muted">Runs: {workflow.runs || 0}</span>
          </div>
          <p className="text-sm text-text-muted truncate">{workflow.description}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Icon name={getTriggerIcon(workflow.trigger?.type)} size={12} />
              {workflow.trigger?.type}
            </span>
            <span>{workflow.actions?.length || 0} actions</span>
            {workflow.lastRun && <span>Last: {new Date(workflow.lastRun).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {workflow.enabled && <button onClick={() => onRun(workflow.id)} className="px-3 py-1.5 text-xs bg-accent/10 text-accent rounded hover:bg-accent/20 flex items-center gap-1"><Icon name="Play" size={12} /> Run</button>}
        <button onClick={() => onToggle(workflow.id)} className={`px-3 py-1.5 text-xs rounded ${workflow.enabled ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'} hover:opacity-80`}>
          {workflow.enabled ? 'Pause' : 'Enable'}
        </button>
        <button onClick={() => onEdit(workflow)} className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Edit" size={14} /></button>
        <button onClick={() => onDelete(workflow.id)} className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
      </div>
    </div>
  )
}

function TriggerList({ triggers, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      <h3 className="font-semibold text-text mb-4">Available Trigger Types</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {triggerTypes.map(type => (
          <TriggerCard key={type} type={type} />
        ))}
      </div>
    </div>
  )
}

function TriggerCard({ type }) {
  return (
    <div className="glass p-4 rounded-lg hover:bg-bg-elevated/50 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
          <Icon name={getTriggerIcon(type)} size={20} className="text-accent" />
        </div>
        <h4 className="font-medium text-text capitalize">{type.replace('_', ' ')}</h4>
      </div>
      <p className="text-sm text-text-muted mb-4">{getTriggerDescription(type)}</p>
      <div className="flex flex-wrap gap-1">
        {getTriggerConfigFields(type).map(field => (
          <span key={field} className="px-2 py-0.5 text-xs bg-border rounded text-text-muted">{field}</span>
        ))}
      </div>
    </div>
  )
}

function getTriggerIcon(type) {
  switch (type) {
    case 'schedule': return 'Clock'
    case 'webhook': return 'Globe'
    case 'manual': return 'MousePointer'
    case 'event': return 'Zap'
    case 'email': return 'Mail'
    case 'file_watch': return 'File'
    default: return 'Zap'
  }
}

function getTriggerDescription(type) {
  switch (type) {
    case 'schedule': return 'Run on a cron schedule (e.g., daily at 9 AM)'
    case 'webhook': return 'Trigger via HTTP POST from external services'
    case 'manual': return 'Run manually from dashboard or API'
    case 'event': return 'React to system events (file changes, etc.)'
    case 'email': return 'Trigger when email matches criteria'
    case 'file_watch': return 'Watch directory for new/changed files'
    default: return 'Custom trigger'
  }
}

function getTriggerConfigFields(type) {
  switch (type) {
    case 'schedule': return ['cron expression', 'timezone']
    case 'webhook': return ['secret', 'path', 'method']
    case 'manual': return []
    case 'event': return ['event type', 'filters']
    case 'email': return ['from', 'subject filter', 'has attachment']
    case 'file_watch': return ['path', 'pattern', 'recursive']
    default: return []
  }
}

function RunList({ runs, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {runs.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="History" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No workflow runs yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.slice(0, 20).map(r => (
            <RunCard key={r.id} run={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function RunCard({ run }) {
  return (
    <div className="glass p-3 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${run.status === 'success' ? 'bg-success/20' : run.status === 'failed' ? 'bg-danger/20' : 'bg-warning/20'}`}>
          <Icon name={run.status === 'success' ? 'CheckCircle' : run.status === 'failed' ? 'XCircle' : 'Loader'} size={16} className={run.status === 'success' ? 'text-success' : run.status === 'failed' ? 'text-danger' : 'text-warning'} />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-text truncate">{run.workflowName}</p>
          <p className="text-xs text-text-muted flex items-center gap-2">
            <span>{new Date(run.startedAt).toLocaleString()}</span>
            <span className={`px-1.5 py-0.5 rounded text-xs ${run.status === 'success' ? 'bg-success/10 text-success' : run.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
              {run.status}
            </span>
            {run.duration && <span>{run.duration}ms</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Eye" size={14} /></button>
      </div>
    </div>
  )
}

function TemplateList({ onUpdate, onUse }) {
  const templates = [
    { name: 'Daily Backup', description: 'Backup database to S3 at 2 AM', trigger: { type: 'schedule', config: { cron: '0 2 * * *' } }, actions: [{ type: 'run_script', config: { script: 'backup.sh', args: ['--to-s3'] } }] },
    { name: 'Webhook to Slack', description: 'Forward webhook payloads to Slack channel', trigger: { type: 'webhook', config: { path: '/hooks/slack', secret: '...' } }, actions: [{ type: 'http_request', config: { url: 'https://hooks.slack.com/...', method: 'POST', body: '{{payload}}' } }] },
    { name: 'Daily Report Email', description: 'Send daily metrics summary via email', trigger: { type: 'schedule', config: { cron: '0 8 * * *' } }, actions: [{ type: 'send_email', config: { to: 'team@company.com', subject: 'Daily Report', template: 'daily-report' } }] },
    { name: 'GitHub Issue Sync', description: 'Sync new GitHub issues to internal task board', trigger: { type: 'webhook', config: { path: '/hooks/github' } }, actions: [{ type: 'create_task', config: { project: 'Engineering', from: 'github' } }] },
  ]
  return (
    <div className="glass p-4 rounded-xl">
      <h3 className="font-semibold text-text mb-4">Workflow Templates</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map(t => (
          <div key={t.name} className="glass p-4 rounded-lg hover:bg-bg-elevated/50 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-semibold text-text">{t.name}</h4>
                <p className="text-sm text-text-muted">{t.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted mb-3">
              <span className="flex items-center gap-1"><Icon name={getTriggerIcon(t.trigger.type)} size={12} /> {t.trigger.type}</span>
              <span>{t.actions.length} actions</span>
            </div>
            <button onClick={() => onUse(t)} className="w-full px-3 py-2 bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors text-sm">Use Template</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkflowForm({ workflow, editing, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">{editing ? 'Edit Workflow' : 'New Workflow'}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Name *</label>
          <input type="text" value={workflow.name} onChange={e => onChange({...workflow, name: e.target.value})} placeholder="Daily Backup to S3" className="input" autoFocus />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Description</label>
          <textarea value={workflow.description} onChange={e => onChange({...workflow, description: e.target.value})} placeholder="What does this workflow do?" rows={2} className="input resize-y" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Trigger</label>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="triggerType" value="schedule" checked={workflow.trigger?.type === 'schedule'} onChange={e => onChange({...workflow, trigger: { type: 'schedule', config: workflow.trigger?.config || {} }})} className="accent-accent" />
                <span>Schedule (cron)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="triggerType" value="webhook" checked={workflow.trigger?.type === 'webhook'} onChange={e => onChange({...workflow, trigger: { type: 'webhook', config: workflow.trigger?.config || {} }})} className="accent-accent" />
                <span>Webhook</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="triggerType" value="manual" checked={workflow.trigger?.type === 'manual'} onChange={e => onChange({...workflow, trigger: { type: 'manual', config: {} }})} className="accent-accent" />
                <span>Manual</span>
              </label>
            </div>
            {workflow.trigger?.type === 'schedule' && (
              <div className="ml-8 space-y-2 pl-4 border-l-2 border-border">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Cron Expression</label>
                    <input type="text" value={workflow.trigger?.config?.cron || '0 2 * * *'} onChange={e => onChange({...workflow, trigger: { ...workflow.trigger, config: { ...workflow.trigger.config, cron: e.target.value } }})} placeholder="0 2 * * *" className="input font-mono" />
                    <p className="text-xs text-text-muted">Runs daily at 2 AM</p>
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Timezone</label>
                    <input type="text" value={workflow.trigger?.config?.timezone || 'UTC'} onChange={e => onChange({...workflow, trigger: { ...workflow.trigger, config: { ...workflow.trigger.config, timezone: e.target.value } }})} placeholder="UTC" className="input" />
                  </div>
                </div>
              </div>
            )}
            {workflow.trigger?.type === 'webhook' && (
              <div className="ml-8 space-y-2 pl-4 border-l-2 border-border">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Webhook Path</label>
                  <input type="text" value={workflow.trigger?.config?.path || '/hooks/webhook'} onChange={e => onChange({...workflow, trigger: { ...workflow.trigger, config: { ...workflow.trigger.config, path: e.target.value } }})} placeholder="/hooks/my-webhook" className="input" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Secret (for verification)</label>
                  <input type="text" value={workflow.trigger?.config?.secret || ''} onChange={e => onChange({...workflow, trigger: { ...workflow.trigger, config: { ...workflow.trigger.config, secret: e.target.value } }})} placeholder="optional secret" className="input" />
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Actions</label>
          <div className="space-y-2">
            {workflow.actions.map((action, i) => (
              <ActionRow key={i} action={action} index={i} onChange={a => onChange({...workflow, actions: workflow.actions.map((ac, j) => j === i ? a : ac)})} onRemove={() => onChange({...workflow, actions: workflow.actions.filter((_, j) => j !== i)})} />
            ))}
            <button onClick={() => onChange({...workflow, actions: [...workflow.actions, { type: 'http_request', config: {} }]})} className="w-full py-2 border-2 border-dashed border-border-hover rounded-lg text-text-muted hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-2">
              <Icon name="Plus" size={16} /> Add Action
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={workflow.enabled} onChange={e => onChange({...workflow, enabled: e.target.checked})} className="accent-accent" />
            <span className="text-sm text-text">Enabled</span>
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!workflow.name || workflow.actions.length === 0}>{editing ? 'Save Changes' : 'Create Workflow'}</button>
      </div>
    </div>
  )
}

function ActionRow({ action, index, onChange, onRemove }) {
  return (
    <div className="glass p-3 rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-xs text-text-muted w-6 text-center">{index + 1}</span>
        <select value={action.type} onChange={e => onChange({...action, type: e.target.value})} className="input w-40">
          {actionTypes.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        <button onClick={onRemove} className="p-1.5 rounded hover:bg-danger/10 text-danger ml-2"><Icon name="Trash2" size={14} /></button>
      </div>
      <ActionConfig action={action} index={index} onChange={a => onChange({...action, config: a})} />
    </div>
  )
}

function ActionConfig({ action, index, onChange }) {
  switch (action.type) {
    case 'http_request':
      return (
        <div className="ml-8 space-y-2 pl-4 border-l-2 border-border">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={action.config?.url || ''} onChange={e => onChange({...action.config, url: e.target.value})} placeholder="https://api.example.com/endpoint" className="input" />
            <select value={action.config?.method || 'POST'} onChange={e => onChange({...action.config, method: e.target.value})} className="input">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Headers (JSON)</label>
            <textarea value={JSON.stringify(action.config?.headers || {}, null, 2)} onChange={e => { try { onChange({...action.config, headers: JSON.parse(e.target.value) }) } catch {} }} rows={3} className="input font-mono text-xs resize-y" placeholder='{"Authorization": "Bearer {{token}}", "Content-Type": "application/json"}' />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Body (template)</label>
            <textarea value={action.config?.body || ''} onChange={e => onChange({...action.config, body: e.target.value})} rows={3} className="input resize-y" placeholder='{"key": "{{payload.value}}"}' />
          </div>
        </div>
      )
    case 'run_script':
      return (
        <div className="ml-8 space-y-2 pl-4 border-l-2 border-border">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={action.config?.script || ''} onChange={e => onChange({...action.config, script: e.target.value})} placeholder="backup.sh" className="input" />
            <input type="text" value={action.config?.args?.join(' ') || ''} onChange={e => onChange({...action.config, args: e.target.value.split(' ').filter(Boolean)})} placeholder="--to-s3 --compress" className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Working Directory</label>
            <input type="text" value={action.config?.cwd || '/root'} onChange={e => onChange({...action.config, cwd: e.target.value})} placeholder="/root" className="input" />
          </div>
        </div>
      )
    case 'send_email':
      return (
        <div className="ml-8 space-y-2 pl-4 border-l-2 border-border">
          <div className="grid grid-cols-2 gap-2">
            <input type="email" value={action.config?.to || ''} onChange={e => onChange({...action.config, to: e.target.value})} placeholder="team@company.com" className="input" />
            <input type="text" value={action.config?.subject || ''} onChange={e => onChange({...action.config, subject: e.target.value})} placeholder="Daily Report" className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Template / Body</label>
            <textarea value={action.config?.body || ''} onChange={e => onChange({...action.config, body: e.target.value})} rows={3} className="input resize-y" placeholder="Hello {{name}}, here is your report..." />
          </div>
        </div>
      )
    default:
      return <div className="ml-8 text-sm text-text-muted">No config for this action type</div>
  }
}

function MetricCard({ label, value, icon, color }) {
  return (
    <div className="glass p-4 rounded-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-text mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl bg-${color}/10 flex items-center justify-center`}>
          <Icon name={icon} size={24} className={`text-${color}`} />
        </div>
      </div>
    </div>
  )
}