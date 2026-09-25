// Agent state machine - based on Herdr's 5 states
export const AGENT_STATES = {
  UNKNOWN: 'unknown',
  IDLE: 'idle',
  WORKING: 'working',
  BLOCKED: 'blocked',
  DONE: 'done'
}

export const AGENT_STATE_LABELS = {
  [AGENT_STATES.UNKNOWN]: '?',
  [AGENT_STATES.IDLE]: '●',
  [AGENT_STATES.WORKING]: '⟳',
  [AGENT_STATES.BLOCKED]: '◉',
  [AGENT_STATES.DONE]: '✓'
}

export const AGENT_STATE_COLORS = {
  [AGENT_STATES.UNKNOWN]: 'text-text-muted',
  [AGENT_STATES.IDLE]: 'text-success',
  [AGENT_STATES.WORKING]: 'text-warning',
  [AGENT_STATES.BLOCKED]: 'text-danger',
  [AGENT_STATES.DONE]: 'text-accent'
}

export const AGENT_STATE_BG = {
  [AGENT_STATES.UNKNOWN]: 'bg-border-hover',
  [AGENT_STATES.IDLE]: 'bg-success/20',
  [AGENT_STATES.WORKING]: 'bg-warning/20',
  [AGENT_STATES.BLOCKED]: 'bg-danger/20',
  [AGENT_STATES.DONE]: 'bg-accent/20'
}

// Detection patterns per agent (from Orca's manifest system)
export const AGENT_DETECTION_PATTERNS = {
  'opencode': {
    working: ['▌', 'Working…', 'Thinking…', '●', 'Generating', 'Running', 'Executing'],
    blocked: ['❯', '?', 'Confirm', 'Select', 'Choose', 'Enter', 'Y/n', 'y/N'],
    done: ['Done', 'Completed', 'Finished', '✓'],
    idle: ['opencode', '> ', '$ ']
  },
  'claude-code': {
    working: ['●', 'Thinking', 'Working', 'Processing', '▌'],
    blocked: ['?', 'Confirm', 'Allow', 'Y/n', 'Select'],
    done: ['Done', 'Complete', '✓'],
    idle: ['claude', '> ', '$ ']
  },
  'codex': {
    working: ['▌', 'Working', 'Thinking', '●'],
    blocked: ['?', 'Confirm', 'Y/n', 'Select'],
    done: ['Done', 'Complete', '✓'],
    idle: ['codex', '> ', '$ ']
  },
  'amp': {
    working: ['●', 'Working', 'Thinking', '▌'],
    blocked: ['?', 'Confirm', 'Y/n'],
    done: ['Done', 'Complete'],
    idle: ['amp', '> ', '$ ']
  },
  'aider': {
    working: ['●', 'Working', 'Thinking', '▌'],
    blocked: ['?', 'Confirm', 'Y/n'],
    done: ['Done', 'Complete'],
    idle: ['aider', '> ', '$ ']
  },
  'cursor': {
    working: ['●', 'Working', 'Generating'],
    blocked: ['?', 'Confirm'],
    done: ['Done'],
    idle: ['cursor', '> ', '$ ']
  },
  'gemini-cli': {
    working: ['●', 'Thinking', 'Working'],
    blocked: ['?', 'Confirm', 'Y/n'],
    done: ['Done', 'Complete'],
    idle: ['gemini', '> ', '$ ']
  },
  'grok': {
    working: ['●', 'Thinking', 'Working'],
    blocked: ['?', 'Confirm', 'Y/n'],
    done: ['Done', 'Complete'],
    idle: ['grok', '> ', '$ ']
  },
  'hermes': {
    working: ['●', 'Thinking', 'Working', '▌'],
    blocked: ['?', 'Confirm', 'Y/n', 'Select'],
    done: ['Done', 'Complete', '✓'],
    idle: ['hermes', 'coordinator', 'planner', 'tasks', 'knowledge', 'habits', '> ', '$ ']
  }
}

export function detectAgentState(agentId, terminalOutput) {
  const patterns = AGENT_DETECTION_PATTERNS[agentId] || AGENT_DETECTION_PATTERNS['hermes']
  const output = terminalOutput.toLowerCase()
  
  // Check for blocked (waiting for input) - highest priority
  for (const pattern of patterns.blocked) {
    if (output.includes(pattern.toLowerCase())) {
      return AGENT_STATES.BLOCKED
    }
  }
  
  // Check for working (active processing)
  for (const pattern of patterns.working) {
    if (output.includes(pattern.toLowerCase())) {
      return AGENT_STATES.WORKING
    }
  }
  
  // Check for done (completed task)
  for (const pattern of patterns.done) {
    if (output.includes(pattern.toLowerCase())) {
      return AGENT_STATES.DONE
    }
  }
  
  // Check for idle (ready for input)
  for (const pattern of patterns.idle) {
    if (output.includes(pattern.toLowerCase())) {
      return AGENT_STATES.IDLE
    }
  }
  
  return AGENT_STATES.UNKNOWN
}

// State transition rules (from Herdr)
export const STATE_TRANSITIONS = {
  [AGENT_STATES.UNKNOWN]: [AGENT_STATES.IDLE, AGENT_STATES.WORKING, AGENT_STATES.BLOCKED],
  [AGENT_STATES.IDLE]: [AGENT_STATES.WORKING, AGENT_STATES.BLOCKED, AGENT_STATES.DONE],
  [AGENT_STATES.WORKING]: [AGENT_STATES.IDLE, AGENT_STATES.BLOCKED, AGENT_STATES.DONE],
  [AGENT_STATES.BLOCKED]: [AGENT_STATES.WORKING, AGENT_STATES.IDLE, AGENT_STATES.DONE],
  [AGENT_STATES.DONE]: [AGENT_STATES.IDLE, AGENT_STATES.WORKING, AGENT_STATES.BLOCKED]
}

export function isValidTransition(from, to) {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false
}