// External engines configuration - extracted for reuse across components
export const ENGINES = [
  { id: 'hermes', name: 'Hermes', category: 'general' },
  { id: 'opencode', name: 'OpenCode', category: 'coding' },
  { id: 'codex', name: 'Codex', category: 'coding' },
  { id: 'claude', name: 'Claude Code', category: 'coding' },
  { id: 'amp', name: 'Amp', category: 'coding' },
  { id: 'aider', name: 'Aider', category: 'coding' },
  { id: 'cursor', name: 'Cursor', category: 'coding' },
  { id: 'gemini-cli', name: 'Gemini CLI', category: 'coding' },
  { id: 'grok', name: 'Grok', category: 'coding' },
  { id: 'copilot', name: 'GitHub Copilot', category: 'coding' },
  { id: 'devin', name: 'Devin', category: 'coding' },
  { id: 'continue', name: 'Continue', category: 'coding' },
  { id: 'openclaw', name: 'OpenClaw', category: 'coding' },
  { id: 'pi', name: 'Pi Agent', category: 'coding' },
  { id: 'deepseek', name: 'DeepSeek Harness', category: 'coding' },
]

// Engines that expose a built-in web UI (the rest are TUI-only).
export const WEB_ENGINES = new Set(['hermes', 'opencode', 'deepseek', 'openclaw'])

export const ENGINE_VIEW_KEY = 'lifeos.engine.view'  // { [engineId]: 'web'|'tui' }

export function getEngineView(engineId, fallback = 'web') {
  try {
    const m = JSON.parse(localStorage.getItem(ENGINE_VIEW_KEY) || '{}')
    if (m[engineId]) return m[engineId]
  } catch {}
  return fallback
}

export function setEngineView(engineId, view) {
  try {
    const m = JSON.parse(localStorage.getItem(ENGINE_VIEW_KEY) || '{}')
    m[engineId] = view
    localStorage.setItem(ENGINE_VIEW_KEY, JSON.stringify(m))
  } catch {}
}

// Get all agents grouped by category for the engine selector
export function getEnginesByCategory() {
  const cats = {}
  for (const e of ENGINES) {
    cats[e.category] = cats[e.category] || []
    cats[e.category].push(e)
  }
  return cats
}