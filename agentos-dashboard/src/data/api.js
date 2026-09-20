// Real data layer — talks to the AgentOS backend (/api/all is proxied via Caddy to :3004)
const API = '/api'

export async function fetchAll() {
  const r = await fetch(`${API}/all`)
  if (!r.ok) throw new Error(`API ${r.status}`)
  return r.json()
}

export async function savePlan(data) {
  const r = await fetch(`${API}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveTasks(data) {
  const r = await fetch(`${API}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveNotes(data) {
  const r = await fetch(`${API}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveHabits(data) {
  const r = await fetch(`${API}/habits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveFinances(data) {
  const r = await fetch(`${API}/finances`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveHealth(data) {
  const r = await fetch(`${API}/health`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveLearning(data) {
  const r = await fetch(`${API}/learning`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveContacts(data) {
  const r = await fetch(`${API}/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveAutomations(data) {
  const r = await fetch(`${API}/automations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveMemory(data) {
  const r = await fetch(`${API}/memory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveCalendar(data) {
  const r = await fetch(`${API}/calendar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

export async function saveProjects(data) {
  const r = await fetch(`${API}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  return r.json()
}

// Obsidian sync
export async function obsidianImport(filename, content) {
  const r = await fetch(`${API}/obsidian/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, content }) })
  return r.json()
}
export async function obsidianExport() {
  const r = await fetch(`${API}/obsidian/export`)
  return r.json()
}

export async function askAgent(profile, message) {
  const r = await fetch(`${API}/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, message }),
  })
  return r.json()
}

// Specialized domain agents
export async function askDomainAgent(domain, message, context = {}) {
  const r = await fetch(`${API}/agent/${domain}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  })
  return r.json()
}

// Memory/RAG
export async function ingestMemory(content, source, metadata) {
  const r = await fetch(`${API}/memory/ingest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, source, metadata })
  })
  return r.json()
}

export async function searchMemory(query, limit = 5) {
  const r = await fetch(`${API}/memory/search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, limit })
  })
  return r.json()
}

// Integrations
export async function getGoogleStatus() {
  const r = await fetch(`${API}/integrations/google/status`)
  return r.json()
}

export async function getNotionStatus() {
  const r = await fetch(`${API}/integrations/notion/status`)
  return r.json()
}

export async function getGitHubStatus() {
  const r = await fetch(`${API}/integrations/github/status`)
  return r.json()
}