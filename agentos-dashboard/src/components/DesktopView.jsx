import { useState } from 'react'
import { Icon } from './Icons'
import { TerminalPanel } from './desktop/TerminalPanel'
import { FileManagerPanel } from './desktop/FileManagerPanel'
import { ChatPanel } from './desktop/ChatPanel'
import { SettingsPanel } from './desktop/SettingsPanel'

const TABS = [
  { id: 'terminal', label: 'Terminal', icon: 'Terminal' },
  { id: 'files', label: 'Files', icon: 'Folder' },
  { id: 'chat', label: 'Chat', icon: 'MessageSquare' },
  { id: 'settings', label: 'Settings', icon: 'Settings' },
]

export function DesktopView() {
  const [tab, setTab] = useState('chat')
  const [cwd, setCwd] = useState('/root')
  const [fullscreen, setFullscreen] = useState(false)

  const HEADER_H = fullscreen ? 0 : 56

  return (
    <div
      className={fullscreen ? 'fixed inset-0 z-50 bg-bg flex flex-col' : 'flex flex-col gap-3'}
      style={fullscreen ? {} : { height: `calc(100dvh - ${HEADER_H}px - 40px)` }}
    >
      {/* Desktop header bar like a real desktop */}
      <div className="glass rounded-xl px-4 py-2 flex items-center justify-between shrink-0"
        style={{ borderRadius: fullscreen ? 0 : undefined }}
      >
        <div className="flex items-center gap-2">
          <Icon name="Desktop" size={16} className="text-accent" />
          <span className="text-sm font-semibold text-text">Desktop</span>
          {cwd && <span className="text-xs text-text-muted font-mono hidden sm:inline">({cwd})</span>}
          {fullscreen && <span className="text-xs text-success ml-1">● fullscreen</span>}
        </div>
        <div className="flex items-center gap-1 bg-bg-elevated/50 rounded-lg p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                tab===t.id ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text hover:bg-bg-card'
              }`}
            >
              <Icon name={t.icon} size={15} />
              <span className="hidden md:inline">{t.label}</span>
            </button>
          ))}
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="ml-1 px-2 py-1.5 rounded-md text-sm transition-all flex items-center gap-1 text-warning hover:bg-bg-card"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? '✕' : '⛶'}
          </button>
        </div>
      </div>

      {/* Active panel - fills remaining space */}
      <div className="flex-1 min-h-0" style={{ borderRadius: fullscreen ? 0 : undefined }}>
        {tab === 'terminal' && <TerminalPanel cwd={cwd} onCwdChange={setCwd} />}
        {tab === 'files' && <FileManagerPanel cwd={cwd} onCwdChange={setCwd} />}
        {tab === 'chat' && <ChatPanel fullscreen={fullscreen} />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}