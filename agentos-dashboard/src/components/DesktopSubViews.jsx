import { useState } from 'react'
import { TerminalPanel } from './desktop/TerminalPanel'
import { FileManagerPanel } from './desktop/FileManagerPanel'
import { ChatPanel } from './desktop/ChatPanel'
import { SettingsPanel } from './desktop/SettingsPanel'

// Отдельные полноэкранные вкладки, вынесенные из DesktopView на верхний уровень
// сайдбара Life OS: Terminal, Files, Chat, Settings.

export function TerminalTab() {
  const [cwd, setCwd] = useState('/root')
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 6.5rem)' }}>
      <TerminalPanel cwd={cwd} onCwdChange={setCwd} />
    </div>
  )
}

export function FilesTab() {
  const [cwd, setCwd] = useState('/root')
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 6.5rem)' }}>
      <FileManagerPanel cwd={cwd} onCwdChange={setCwd} />
    </div>
  )
}

export function ChatTab() {
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 6.5rem)' }}>
      <ChatPanel fullscreen={false} />
    </div>
  )
}

export function SettingsTab() {
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 6.5rem)' }}>
      <SettingsPanel />
    </div>
  )
}