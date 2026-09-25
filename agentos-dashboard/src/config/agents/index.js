// 37 Agents from Orca + Life OS custom agents
// Each agent has: id, name, description, provider, keys, launch config, detection, UI

export const AGENT_DEFINITIONS = [
  // ===== CODING AGENTS (from Orca) =====
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic\'s official coding agent. Best for complex refactoring and architecture.',
    provider: 'Anthropic',
    keys: ['ANTHROPIC_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'claude', args: [] },
      web: null
    },
    detect: { bin: ['claude', 'claude-code'], install: 'curl -fsSL https://claude.ai/install.sh | bash </dev/null' },
    uninstall: 'npm uninstall -g @anthropic-ai/claude-code 2>/dev/null; rm -f /usr/local/bin/claude* $(command -v claude 2>/dev/null) /root/.local/bin/claude*; rm -rf /root/.claude /root/.config/claude /root/.local/share/claude'
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI\'s official coding agent (ChatGPT Codex CLI).',
    provider: 'OpenAI',
    keys: ['OPENAI_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'codex', args: [] },
      web: null
    },
    detect: { bin: ['codex'], install: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh </dev/null' },
    uninstall: 'npm uninstall -g @openai/codex 2>/dev/null; rm -f /usr/local/bin/codex $(command -v codex 2>/dev/null); rm -rf /root/.codex /root/.local/share/codex /root/.cache/codex /root/.codex_auth.json'
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Open-source AI coding agent. Modes: TUI, Web UI (opencode serve), or both.',
    provider: 'OpenRouter',
    keys: [],
    category: 'coding',
    launch: {
      tui: { cmd: 'opencode', args: [] },
      web: { cmd: 'opencode serve --port 4096 --hostname 0.0.0.0', port: 4096 }
    },
    detect: { bin: ['opencode'], install: 'curl -fsSL https://opencode.ai/v2/install -o /tmp/install-opencode.sh && bash /tmp/install-opencode.sh --no-modify-path </dev/null; rm -f /tmp/install-opencode.sh' },
    uninstall: 'pkill -f "[o]pencode serve" 2>/dev/null; systemctl disable --now opencode-web 2>/dev/null; rm -f /etc/systemd/system/opencode-web.service; systemctl daemon-reload; rm -rf /root/.opencode /root/.config/opencode /root/.local/share/opencode /root/.cache/opencode /root/.opencode.json /tmp/start-web-opencode.sh; npm uninstall -g opencode-ai 2>/dev/null; rm -f /usr/local/bin/opencode /usr/bin/opencode /root/.local/bin/opencode 2>/dev/null',
    installOptions: { mode: 'both', domain: 'oc.dktunnel.xyz' }
  },
  {
    id: 'amp',
    name: 'Amp',
    description: 'Sourcegraph\'s coding agent (amp). Terminal-first, works with any LLM.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'amp', args: [] },
      web: null
    },
    detect: { bin: ['amp'], install: 'curl -fsSL https://ampcode.com/install.sh | sh </dev/null' },
    uninstall: 'rm -f /usr/local/bin/amp $(command -v amp 2>/dev/null); rm -rf /root/.amp /root/.config/amp /root/.local/share/amp'
  },
  {
    id: 'aider',
    name: 'Aider',
    description: 'AI pair programming in terminal. Works with any model via API.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'aider', args: [] },
      web: null
    },
    detect: { bin: ['aider'], install: 'pip install aider-chat' },
    uninstall: 'pip uninstall -y aider-chat 2>/dev/null; rm -f /usr/local/bin/aider $(command -v aider 2>/dev/null); rm -rf /root/.aider*'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'AI-first code editor (VS Code fork). CLI agent available.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'cursor-agent', args: [] },
      web: null
    },
    detect: { bin: ['cursor-agent', 'cursor'], install: 'curl -fsSL https://cursor.com/install.sh | sh </dev/null' },
    uninstall: 'rm -f /usr/local/bin/cursor* $(command -v cursor 2>/dev/null); rm -rf /root/.cursor /root/.config/Cursor /root/.local/share/cursor'
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: 'Codeium\'s AI IDE. Cascade agent for terminal.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'windsurf', args: [] },
      web: null
    },
    detect: { bin: ['windsurf'], install: 'curl -fsSL https://windsurf.com/install.sh | sh </dev/null' },
    uninstall: 'rm -f /usr/local/bin/windsurf $(command -v windsurf 2>/dev/null); rm -rf /root/.windsurf /root/.config/Windsurf'
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Groq\'s ultra-fast inference CLI agent.',
    provider: 'Groq',
    keys: ['GROQ_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'groq', args: [] },
      web: null
    },
    detect: { bin: ['groq'], install: 'pip install groq-cli' },
    uninstall: 'pip uninstall -y groq-cli 2>/dev/null; rm -f /usr/local/bin/groq $(command -v groq 2>/dev/null)'
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    description: 'Google\'s official Gemini CLI agent.',
    provider: 'Google',
    keys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'gemini', args: [] },
      web: null
    },
    detect: { bin: ['gemini'], install: 'npm install -g @google/gemini-cli' },
    uninstall: 'npm uninstall -g @google/gemini-cli 2>/dev/null; rm -f /usr/local/bin/gemini $(command -v gemini 2>/dev/null); rm -rf /root/.gemini'
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    description: 'GitHub Copilot in terminal (gh copilot).',
    provider: 'GitHub',
    keys: ['GITHUB_TOKEN'],
    category: 'coding',
    launch: {
      tui: { cmd: 'gh', args: ['copilot', 'suggest'] },
      web: null
    },
    detect: { bin: ['gh'], install: 'gh extension install github/gh-copilot' },
    uninstall: 'gh extension remove github/gh-copilot 2>/dev/null'
  },
  {
    id: 'devin',
    name: 'Devin',
    description: 'Cognition\'s autonomous AI software engineer.',
    provider: 'Devin',
    keys: ['DEVIN_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'devin', args: [] },
      web: null
    },
    detect: { bin: ['devin'], install: 'curl -fsSL https://devin.ai/install.sh | sh </dev/null' },
    uninstall: 'rm -f /usr/local/bin/devin $(command -v devin 2>/dev/null); rm -rf /root/.devin /root/.config/devin'
  },
  {
    id: 'continue',
    name: 'Continue',
    description: 'Open-source AI code assistant. Extensible, works with any LLM.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'continue', args: [] },
      web: null
    },
    detect: { bin: ['continue'], install: 'npm install -g @continue/cli' },
    uninstall: 'npm uninstall -g @continue/cli 2>/dev/null; rm -f /usr/local/bin/continue $(command -v continue 2>/dev/null)'
  },
  {
    id: 'grok',
    name: 'Grok',
    description: 'xAI\'s Grok coding agent.',
    provider: 'xAI',
    keys: ['XAI_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'grok', args: [] },
      web: null
    },
    detect: { bin: ['grok'], install: 'pip install grok-cli' },
    uninstall: 'pip uninstall -y grok-cli 2>/dev/null; rm -f /usr/local/bin/grok $(command -v grok 2>/dev/null)'
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    description: 'Multi-channel AI gateway. Web UI on port 18789.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'openclaw', args: [] },
      web: { cmd: 'systemctl --user start openclaw-gateway', port: 18789 }
    },
    detect: { bin: ['openclaw'], install: 'curl -fsSL https://openclaw.ai/install.sh | bash </dev/null' },
    uninstall: 'npm uninstall -g openclaw 2>/dev/null; rm -f /usr/local/bin/openclaw $(command -v openclaw 2>/dev/null); rm -rf /root/.openclaw /root/.config/openclaw /root/.local/share/openclaw'
  },
  {
    id: 'pi',
    name: 'Pi Agent',
    description: 'Pi — AI agent toolkit (unified LLM API + TUI).',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'pi', args: [] },
      web: null
    },
    detect: { bin: ['pi'], install: 'npm install -g @earendil-works/pi-coding-agent </dev/null' },
    uninstall: 'npm uninstall -g @earendil-works/pi-coding-agent 2>/dev/null; rm -f /usr/local/bin/pi $(command -v pi 2>/dev/null); rm -rf /root/.pi /root/.config/pi /root/.local/share/pi'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek Harness (dsh)',
    description: 'DeepSeek Harness — agent harness "everything-plugin". Web UI on :3080.',
    provider: 'DeepSeek',
    keys: ['DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY'],
    category: 'coding',
    launch: {
      tui: { cmd: 'dsh', args: [] },
      web: { cmd: 'dsh web --no-open --port 3080', port: 3080, publicPort: 3090 }
    },
    detect: { bin: ['dsh'], install: 'npm install -g @deepseek-ai/dsh' },
    uninstall: 'rm -rf /root/.dsh /root/.deepseek-harness /root/.deepseek /root/.config/deepseek-harness /root/.local/share/deepseek-harness; npm uninstall -g @deepseek-ai/dsh 2>/dev/null; find /usr/local/lib/node_modules -maxdepth 1 -iname "*deepseek*" -exec rm -rf {} + 2>/dev/null; true'
  },

  // ===== TERMINAL/UTILITY AGENTS =====
  {
    id: 'hermes',
    name: 'Hermes Agent',
    description: 'Hermes Agent (Nous Research) — one of the available engines. User chooses which agent to use.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'general',
    launch: {
      tui: { cmd: 'hermes', args: ['chat', '-p', 'coordinator'] },
      web: { url: 'https://hermes.dktunnel.xyz', port: 9119 }
    },
    detect: { bin: ['/usr/local/bin/hermes'], install: null, alwaysInstalled: true },
    uninstall: null,
    update: [
      "echo '[1/3] Обновление пакета hermes-agent (pip)...'",
      "/usr/local/lib/hermes-agent/venv/bin/pip install --upgrade hermes-agent 2>&1",
      "echo '[2/3] Проверка версии...'",
      "/usr/local/lib/hermes-agent/venv/bin/pip show hermes-agent 2>/dev/null | grep -i '^Version' || true",
      "echo '[3/3] Готово. Примечание: официальная команда `hermes update` может требовать интерактивного ввода — после pip перезапусти TUI-сессии Hermes.'"
    ].join('; ')
  },
  {
    id: 'tmux',
    name: 'Tmux',
    description: 'Terminal multiplexer — persistent sessions, split panes.',
    provider: 'System',
    keys: [],
    category: 'utility',
    launch: {
      tui: { cmd: 'tmux', args: ['new-session', '-A', '-s', 'lifeos'] },
      web: null
    },
    detect: { bin: ['tmux'], install: 'apt-get update && apt-get install -y tmux' },
    uninstall: 'apt-get remove -y tmux 2>/dev/null'
  },
  {
    id: 'zellij',
    name: 'Zellij',
    description: 'Modern terminal workspace with tabs, panes, and layouts.',
    provider: 'System',
    keys: [],
    category: 'utility',
    launch: {
      tui: { cmd: 'zellij', args: [] },
      web: null
    },
    detect: { bin: ['zellij'], install: 'cargo install --locked zellij' },
    uninstall: 'cargo uninstall zellij 2>/dev/null; rm -f /usr/local/bin/zellij $(command -v zellij 2>/dev/null)'
  },

  // ===== INFRASTRUCTURE COMPONENTS =====
  {
    id: 'n8n',
    name: 'n8n',
    description: 'n8n Workflow Automation — visual workflow builder (n8n.dktunnel.xyz, port 5678).',
    provider: 'Self-hosted',
    keys: [],
    category: 'infrastructure',
    isComponent: true,
    launch: {
      tui: null,
      web: { url: 'https://n8n.dktunnel.xyz', port: 5678 }
    },
    detect: { cmd: 'systemctl is-active n8n 2>/dev/null | grep -q active || command -v n8n >/dev/null 2>&1', install: 'npm install -g n8n' },
    uninstall: 'systemctl stop n8n 2>/dev/null; systemctl disable n8n 2>/dev/null; rm -f /etc/systemd/system/n8n.service; systemctl daemon-reload; npm uninstall -g n8n 2>/dev/null'
  },
  {
    id: 'coder',
    name: 'Coder',
    description: 'Coder — self-hosted cloud dev (VS Code in browser, workspaces; coder.dktunnel.xyz, port 7080).',
    provider: 'Self-hosted',
    keys: [],
    category: 'infrastructure',
    isComponent: true,
    launch: {
      tui: null,
      web: { url: 'https://coder.dktunnel.xyz', port: 7080 }
    },
    detect: { cmd: 'systemctl is-active coder 2>/dev/null | grep -q active || command -v coder >/dev/null 2>&1', install: 'curl -fsSL https://coder.com/install.sh | sh' },
    uninstall: 'systemctl stop coder 2>/dev/null; systemctl disable coder 2>/dev/null; rm -f /etc/systemd/system/coder.service /usr/bin/coder /usr/local/bin/coder; systemctl daemon-reload; docker rm -f coder-db 2>/dev/null; rm -rf /root/coder-tpl /root/coder-dev; rm -f /root/coder.env /root/.coder-admin.env /root/.coder-db.env /root/.coder.token /root/.coder-cli.env'
  },

  // ===== LIFE OS DOMAIN AGENTS =====
  {
    id: 'planner',
    name: 'Planner',
    description: 'Daily/weekly planning, time-blocking, calendar sync.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'planner'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  },
  {
    id: 'tasks',
    name: 'Tasks',
    description: 'GTD, projects, kanban, next actions.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'tasks'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  },
  {
    id: 'knowledge',
    name: 'Knowledge',
    description: 'Notes, Zettelkasten, RAG, search, graph.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'knowledge'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  },
  {
    id: 'habits',
    name: 'Habits',
    description: 'Trackers, streaks, rituals, metrics.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'habits'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  },
  {
    id: 'finances',
    name: 'Finances',
    description: 'Accounts, transactions, budgets, goals.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'financial_planner'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  },
  {
    id: 'health',
    name: 'Health',
    description: 'Metrics, workouts, sleep, nutrition, appointments.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'health_coach'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  },
  {
    id: 'learning',
    name: 'Learning',
    description: 'Courses, topics, progress, resources.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'learning_coach'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  },
  {
    id: 'contacts',
    name: 'Contacts',
    description: 'People, organizations, interactions, tags (CRM).',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'crm_agent'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  },
  {
    id: 'automations',
    name: 'Automations',
    description: 'Workflows, triggers, runs.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'automation_engineer'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Events, calendars, scheduling.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'calendar_manager'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  },
  {
    id: 'projects',
    name: 'Projects',
    description: 'Project management, milestones, tracking.',
    provider: 'OpenRouter',
    keys: ['OPENROUTER_API_KEY'],
    category: 'lifeos',
    launch: { tui: { cmd: 'hermes', args: ['chat', '-p', 'project_manager'] }, web: { url: 'https://hermes.dktunnel.xyz' } },
    detect: { bin: ['/usr/local/bin/hermes'] }
  }
]

// Categories for grouping in UI
export const AGENT_CATEGORIES = [
  { id: 'coding', label: '🤖 Coding Agents', icon: 'Code' },
  { id: 'general', label: '💬 General Chat', icon: 'MessageSquare' },
  { id: 'utility', label: '🔧 Terminal Tools', icon: 'Terminal' },
  { id: 'infrastructure', label: '☁️ Infrastructure', icon: 'Server' },
  { id: 'lifeos', label: '🧠 Life OS Domains', icon: 'Brain' }
]

// Helper functions
export function getAgentById(id) {
  return AGENT_DEFINITIONS.find(a => a.id === id)
}

export function getAgentsByCategory(category) {
  return AGENT_DEFINITIONS.filter(a => a.category === category)
}

export function getAllAgents() {
  return AGENT_DEFINITIONS
}

export function getInstalledAgents() {
  // This will be populated by the backend API
  return AGENT_DEFINITIONS.filter(a => a.detect?.alwaysInstalled || a.installed)
}