import { useState } from 'react'
import { Icon } from './Icons'

const contactTypes = ['person', 'organization']
const interactionTypes = ['meeting', 'call', 'email', 'note', 'task']

export function ContactsView({ contacts, onUpdate }) {
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState('people')
  const [search, setSearch] = useState('')
  const [newPerson, setNewPerson] = useState({ name: '', email: '', phone: '', organization: '', role: '', tags: '', notes: '' })
  const [newOrg, setNewOrg] = useState({ name: '', domain: '', industry: '', size: '', website: '', notes: '' })
  const [newInteraction, setNewInteraction] = useState({ contactId: '', type: 'note', date: new Date().toISOString().slice(0,10), summary: '', followUp: '' })

  const filteredPeople = contacts.people
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => a.name.localeCompare(b.name))

  const totalContacts = contacts.people.length + contacts.organizations.length
  const recentInteractions = contacts.interactions.slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text">Contacts</h1>
            <p className="text-text-muted">People • Organizations • Interactions • CRM</p>
          </div>
          <div className="relative">
            <Icon name="Search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..." className="input pl-10 w-64" />
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
          <Icon name="Plus" size={18} />
          Add
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="People" value={contacts.people.length} icon="Users" color="accent" />
        <MetricCard label="Organizations" value={contacts.organizations.length} icon="Building" color="success" />
        <MetricCard label="Total" value={totalContacts} icon="Network" color="warning" />
        <MetricCard label="Interactions" value={contacts.interactions.length} icon="MessageSquare" color="success" />
      </div>

      <div className="flex items-center gap-2 border-b border-border mb-4">
        {['people', 'organizations', 'interactions', 'tags'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'people' && <PeopleList people={filteredPeople} organizations={contacts.organizations} onUpdate={onUpdate} />}
      {activeTab === 'organizations' && <OrgList orgs={contacts.organizations} onUpdate={onUpdate} />}
      {activeTab === 'interactions' && <InteractionList interactions={contacts.interactions} people={contacts.people} orgs={contacts.organizations} onUpdate={onUpdate} />}
      {activeTab === 'tags' && <TagView tags={getAllTags(contacts)} onUpdate={onUpdate} />}

      {showForm && (
        <ContactForm
          mode={activeTab}
          person={newPerson}
          org={newOrg}
          interaction={newInteraction}
          people={contacts.people}
          orgs={contacts.organizations}
          onPersonChange={setNewPerson}
          onOrgChange={setNewOrg}
          onInteractionChange={setNewInteraction}
          onSubmit={() => {
            if (activeTab === 'people' && newPerson.name) {
              const p = { ...newPerson, id: `p-${Date.now()}`, created: new Date().toISOString().slice(0,10), tags: newPerson.tags.split(',').map(t => t.trim()).filter(Boolean) }
              onUpdate({ ...contacts, people: [p, ...contacts.people] })
              setNewPerson({ name: '', email: '', phone: '', organization: '', role: '', tags: '', notes: '' })
            } else if (activeTab === 'organizations' && newOrg.name) {
              const o = { ...newOrg, id: `org-${Date.now()}`, created: new Date().toISOString().slice(0,10), tags: newOrg.tags.split(',').map(t => t.trim()).filter(Boolean) }
              onUpdate({ ...contacts, organizations: [o, ...contacts.organizations] })
              setNewOrg({ name: '', domain: '', industry: '', size: '', website: '', notes: '' })
            } else if (activeTab === 'interactions' && newInteraction.contactId && newInteraction.summary) {
              const i = { ...newInteraction, id: `int-${Date.now()}` }
              onUpdate({ ...contacts, interactions: [i, ...contacts.interactions] })
              setNewInteraction({ contactId: '', type: 'note', date: new Date().toISOString().slice(0,10), summary: '', followUp: '' })
            }
            setShowForm(false)
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function PeopleList({ people, organizations, onUpdate }) {
  const handleUpdate = (id, updates) => onUpdate(c => ({ ...c, people: c.people.map(p => p.id === id ? { ...p, ...updates } : p) }))
  return (
    <div className="glass p-4 rounded-xl">
      {people.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Users" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No people yet. Add your first contact!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {people.map(p => (
            <PersonCard key={p.id} person={p} organizations={organizations} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function PersonCard({ person, organizations, onUpdate }) {
  const org = organizations.find(o => o.id === person.organization)
  return (
    <div className="glass p-4 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
          <Icon name="User" size={24} className="text-accent" />
        </div>
        <div className="min-w-0">
          <h4 className="font-semibold text-text truncate">{person.name}</h4>
          <p className="text-xs text-text-muted flex items-center gap-2">
            {person.email && <span className="truncate max-w-xs">{person.email}</span>}
            {person.phone && <span className="text-text-muted">• {person.phone}</span>}
            {org && <span className="px-1.5 py-0.5 bg-border rounded text-text-muted">{org.name}</span>}
            {person.role && <span className="px-1.5 py-0.5 bg-border rounded text-text-muted">{person.role}</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Edit" size={14} /></button>
        <button className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
      </div>
    </div>
  )
}

function OrgList({ orgs, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {orgs.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Building" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No organizations yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orgs.map(o => (
            <div key={o.id} className="glass p-3 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <Icon name="Building" size={20} className="text-success" />
                </div>
                <div>
                  <h4 className="font-medium text-text">{o.name}</h4>
                  <p className="text-xs text-text-muted flex items-center gap-2">
                    {o.domain && <span>{o.domain}</span>}
                    {o.industry && <span className="px-1.5 py-0.5 bg-border rounded text-text-muted">{o.industry}</span>}
                    {o.size && <span className="px-1.5 py-0.5 bg-border rounded text-text-muted">{o.size}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Edit" size={14} /></button>
                <button className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InteractionList({ interactions, people, orgs, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {interactions.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="MessageSquare" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No interactions logged yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {interactions.slice(0, 20).map(i => (
            <InteractionCard key={i.id} interaction={i} people={people} orgs={orgs} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function InteractionCard({ interaction, people, orgs, onUpdate }) {
  const contact = people.find(p => p.id === interaction.contactId) || orgs.find(o => o.id === interaction.contactId)
  return (
    <div className="glass p-3 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getInteractionColor(interaction.type)}`}>
          <Icon name={getInteractionIcon(interaction.type)} size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-text truncate">{interaction.summary}</p>
          <p className="text-xs text-text-muted flex items-center gap-2">
            <span>{interaction.date}</span>
            <span className="px-1.5 py-0.5 bg-border rounded text-text-muted capitalize">{interaction.type}</span>
            {contact && <span className="px-1.5 py-0.5 bg-border rounded text-text-muted">{contact.name}</span>}
          </p>
        </div>
      </div>
      <div className="text-right">
        {interaction.followUp && <p className="text-xs text-warning">⏰ {interaction.followUp}</p>}
      </div>
    </div>
  )
}

function TagView({ tags, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, count) => (
          <span key={tag} className="px-3 py-1 bg-border rounded-full text-sm text-text-muted flex items-center gap-1">
            {tag}
            <span className="px-1.5 py-0.5 bg-bg-elevated rounded text-xs">{count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function getAllTags({ people, organizations }) {
  const tagSet = new Set()
  people.forEach(p => p.tags.forEach(t => tagSet.add(t)))
  organizations.forEach(o => o.tags.forEach(t => tagSet.add(t)))
  return Array.from(tagSet).sort()
}

function ContactForm({ mode, person, org, interaction, people, orgs, onPersonChange, onOrgChange, onInteractionChange, onSubmit, onCancel }) {
  if (mode === 'people') return <PersonForm person={person} orgs={orgs} onChange={onPersonChange} onSubmit={onSubmit} onCancel={onCancel} />
  if (mode === 'organizations') return <OrgForm org={org} onChange={onOrgChange} onSubmit={onSubmit} onCancel={onCancel} />
  if (mode === 'interactions') return <InteractionForm interaction={interaction} contacts={people} orgs={orgs} onChange={onInteractionChange} onSubmit={onSubmit} onCancel={onCancel} />
  return null
}

function PersonForm({ person, orgs, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">New Contact</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Name *</label>
          <input type="text" value={person.name} onChange={e => onChange({...person, name: e.target.value})} placeholder="John Doe" className="input" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Email</label>
            <input type="email" value={person.email} onChange={e => onChange({...person, email: e.target.value})} placeholder="john@example.com" className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Phone</label>
            <input type="tel" value={person.phone} onChange={e => onChange({...person, phone: e.target.value})} placeholder="+1 555 123 4567" className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Organization</label>
          <select value={person.organization} onChange={e => onChange({...person, organization: e.target.value})} className="input">
            <option value="">None</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Role / Title</label>
          <input type="text" value={person.role} onChange={e => onChange({...person, role: e.target.value})} placeholder="CTO, Engineering Manager..." className="input" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Tags (comma separated)</label>
          <input type="text" value={person.tags} onChange={e => onChange({...person, tags: e.target.value})} placeholder="investor, advisor, friend" className="input" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Notes</label>
          <textarea value={person.notes} onChange={e => onChange({...person, notes: e.target.value})} placeholder="How did you meet? Important context..." rows={3} className="input resize-y" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!person.name}>Add Contact</button>
      </div>
    </div>
  )
}

function OrgForm({ org, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">New Organization</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Name *</label>
          <input type="text" value={org.name} onChange={e => onChange({...org, name: e.target.value})} placeholder="Acme Corp" className="input" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Domain</label>
            <input type="text" value={org.domain} onChange={e => onChange({...org, domain: e.target.value})} placeholder="acme.com" className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Industry</label>
            <input type="text" value={org.industry} onChange={e => onChange({...org, industry: e.target.value})} placeholder="SaaS, Fintech, Health..." className="input" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Size</label>
            <select value={org.size} onChange={e => onChange({...org, size: e.target.value})} className="input">
              <option value="">Unknown</option>
              <option value="1-10">1-10</option>
              <option value="11-50">11-50</option>
              <option value="51-200">51-200</option>
              <option value="201-500">201-500</option>
              <option value="501-1000">501-1000</option>
              <option value="1000+">1000+</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Website</label>
            <input type="url" value={org.website} onChange={e => onChange({...org, website: e.target.value})} placeholder="https://acme.com" className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Notes</label>
          <textarea value={org.notes} onChange={e => onChange({...org, notes: e.target.value})} placeholder="Key details, relationships..." rows={3} className="input resize-y" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!org.name}>Add Organization</button>
      </div>
    </div>
  )
}

function InteractionForm({ interaction, contacts, orgs, onChange, onSubmit, onCancel }) {
  const allContacts = [...contacts.map(c => ({ id: c.id, name: c.name, type: 'person' })), ...orgs.map(o => ({ id: o.id, name: o.name, type: 'organization' }))]
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">Log Interaction</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Contact *</label>
          <select value={interaction.contactId} onChange={e => onChange({...interaction, contactId: e.target.value})} className="input">
            <option value="">Select contact</option>
            {allContacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Type</label>
            <select value={interaction.type} onChange={e => onChange({...interaction, type: e.target.value})} className="input">
              <option value="meeting">Meeting</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="note">Note</option>
              <option value="task">Task</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Date</label>
            <input type="date" value={interaction.date} onChange={e => onChange({...interaction, date: e.target.value})} className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Summary *</label>
          <textarea value={interaction.summary} onChange={e => onChange({...interaction, summary: e.target.value})} placeholder="What happened?" rows={3} className="input resize-y" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Follow-up (date or action)</label>
          <input type="text" value={interaction.followUp} onChange={e => onChange({...interaction, followUp: e.target.value})} placeholder="Call back next week" className="input" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!interaction.contactId || !interaction.summary}>Log Interaction</button>
      </div>
    </div>
  )
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

function getInteractionColor(type) {
  switch (type) {
    case 'meeting': return 'bg-accent/20 text-accent'
    case 'call': return 'bg-success/20 text-success'
    case 'email': return 'bg-warning/20 text-warning'
    case 'note': return 'bg-purple/20 text-purple'
    case 'task': return 'bg-blue/20 text-blue'
    default: return 'bg-border-hover text-text-muted'
  }
}

function getInteractionIcon(type) {
  switch (type) {
    case 'meeting': return 'Users'
    case 'call': return 'Phone'
    case 'email': return 'Mail'
    case 'note': return 'FileText'
    case 'task': return 'CheckSquare'
    default: return 'MessageSquare'
  }
}