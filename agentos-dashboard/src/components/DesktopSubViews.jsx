import { useState } from 'react'
import { Icon } from './Icons'
import { TerminalPanel } from './desktop/TerminalPanel'
import { FileManagerPanel } from './desktop/FileManagerPanel'
import { ChatPanel } from './desktop/ChatPanel'
import { SettingsPanel } from './desktop/SettingsPanel'

// Отдельные вкладки, вынесенные из DesktopView на верхний уровень сайдбара Life OS:
// Terminal, Files, Chat, Settings. Каждая имеет кнопку «на весь экран».

function FullscreenShell({ label, icon, height, children }) {
  const [fs, setFs] = useState(false)
  return (
    <div className={fs ? 'fixed inset-0 z-50 bg-bg flex flex-col' : 'flex flex-col gap-3'}>
      <div className="glass rounded-xl px-4 py-2 flex items-center justify-between shrink-0"
        style={{ borderRadius: fs ? 0 : undefined }}>
        <div className="flex items-center gap-2">
          <Icon name={icon} size={16} className="text-accent" />
          <span className="text-sm font-semibold text-text">{label}</span>
          {fs && <span className="text-xs text-success ml-1">● fullscreen</span>}
        </div>
        <button onClick={() => setFs(!fs)} title={fs ? 'Выйти из полноэкранного' : 'Развернуть на весь экран'}
          className={`px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${fs ? 'border-accent text-accent' : 'border-border text-text-muted hover:bg-bg-elevated hover:text-accent'}`}>
          <Icon name={fs ? 'ShrinkDown' : 'Expand'} size={14} />
          <span className="text-xs hidden sm:inline">{fs ? 'Свернуть' : 'На весь экран'}</span>
        </button>
      </div>
      <div className="flex-1 min-h-0" style={fs ? {} : { height: height }}>
        {children}
      </div>
    </div>
  )
}

export function TerminalTab() {
  const [cwd, setCwd] = useState('/root')
  return (
    <FullscreenShell label="Hermes Terminal" icon="Terminal" height="calc(100vh - 9rem)">
      <TerminalPanel cwd={cwd} onCwdChange={setCwd} />
    </FullscreenShell>
  )
}

export function FilesTab() {
  const [cwd, setCwd] = useState('/root')
  return (
    <FullscreenShell label="Файловый менеджер" icon="Folder" height="calc(100vh - 9rem)">
      <FileManagerPanel cwd={cwd} onCwdChange={setCwd} />
    </FullscreenShell>
  )
}

export function ChatTab() {
  return (
    <FullscreenShell label="Hermes Chat" icon="MessageSquare" height="calc(100vh - 9rem)">
      <ChatPanel fullscreen={false} />
    </FullscreenShell>
  )
}

export function SettingsTab() {
  return (
    <FullscreenShell label="Настройки" icon="Settings" height="calc(100vh - 9rem)">
      <SettingsPanel />
    </FullscreenShell>
  )
}