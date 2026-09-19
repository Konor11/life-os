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

export async function askAgent(profile, message) {
  const r = await fetch(`${API}/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, message }),
  })
  return r.json()
}