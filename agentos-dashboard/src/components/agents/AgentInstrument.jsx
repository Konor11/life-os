import { useState, useRef } from 'react'

const API = '/api'

// A reusable agent-instrument card: dynamic fields → prompt template → run agent → show result.
// Supports {field} placeholders in the prompt that are filled from the form values.
export function AgentInstrument({
  agent = 'coordinator',
  title,
  subtitle,
  description,
  fields = [],          // [{ name, label, type: 'text'|'textarea'|'number', placeholder, default }]
  promptTemplate = '',  // uses {name} for each field
  submitLabel = 'Generate',
  outputTitle = 'Result',
  useSmartTitle = true,
  defaultMode = 'fast',   // 'fast' | 'agent' — initial mode for this card
}) {
  const vals = {}
  for (const f of fields) vals[f.name] = f.default || ''
  const [values, setValues] = useState(vals)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [elapsed, setElapsed] = useState(null)
  const [savedTo, setSavedTo] = useState(null)
  const resultRef = useRef(null)
  const [listening, setListening] = useState(false)
  const [mode, setMode] = useState(defaultMode === 'agent' ? 'agent' : 'fast')  // fast | agent

  const hasVoice = fields.some(f => f.name === 'voiceInput')

  const fileRef = useRef(null)

  const toggleMic = async () => {
    if (listening) { setListening(false); return }
    // Reliable on Android Chrome: open the native voice recorder via file input.
    // Fallback: MediaRecorder where getUserMedia is available (desktop Chrome).
    try {
      if (navigator?.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const rec = new MediaRecorder(stream)
        window.micRec = rec
        const chunks = []
        rec.ondataavailable = (e) => chunks.push(e.data)
        rec.onstop = async () => {
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
          await sendAudio(blob)
        }
        rec.start(1000)
        setListening(true)
        return
      }
    } catch (e) {
      console.error('getUserMedia fallback', e)
    }
    // Native recorder path (works on mobile): pick/record an audio file.
    setListening(true)
    fileRef.current?.click()
  }

  // Send recorded audio blob to server STT, fill voiceInput, then auto-run agent.
  const sendAudio = async (blob, ext) => {
    const buf = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    const b64 = btoa(bin)
    try {
      const r = await fetch(`${API}/stt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: b64, ext: ext || 'webm' }) })
      const d = await r.json()
      if (d.text) {
        set('voiceInput', d.text)
        setListening(false)
        setTimeout(run, 150)  // auto-ask agent after transcription
      } else {
        setListening(false)
        alert('Не распознал речь, попробуй ещё раз.')
      }
    } catch (e) {
      setListening(false)
      alert('Ошибка распознавания: ' + e.message)
    }
  }

  const set = (name, v) => setValues(prev => ({ ...prev, [name]: v }))

  const run = async () => {
    setBusy(true); setError(null); setResult(null); setElapsed(null)
    let prompt = promptTemplate
    for (const f of fields) {
      prompt = prompt.replace(`{${f.name}}`, values[f.name]?.trim() || '')
    }
    const t0 = Date.now()
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), mode === 'agent' ? 180000 : 90000)
      const r = await fetch(`${API}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: agent, message: prompt, mode }),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      const d = await r.json()
      setElapsed(Math.round((Date.now() - t0) / 1000))
      setResult(d.answer || '(пусто)')
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    } catch (e) {
      setError(e.message)
      setElapsed(Math.round((Date.now() - t0) / 1000))
    }
    setBusy(false)
  }

  const copyResult = async () => {
    try { await navigator.clipboard.writeText(result || ''); } catch {}
  }

  const [ttsBusy, setTtsBusy] = useState(false)
  const speakResult = async () => {
    if (!result || ttsBusy) return
    setTtsBusy(true)
    try {
      const r = await fetch(`${API}/tts`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ text: result }) })
      if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || `TTS ${r.status}`) }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      window.agentosAudio?.pause(); window.agentosAudio = null
      const audio = new Audio(url)
      window.agentosAudio = audio
      audio.onended = () => { URL.revokeObjectURL(url); window.agentosAudio = null }
      audio.play()
    } catch (err) {
      alert('Ошибка озвучивания: ' + err.message)
    }
    setTtsBusy(false)
  }

  const saveToNotes = async () => {
    if (!result) return
    try {
      // read current notes, append, save back
      const r = await fetch(`${API}/notes`)
      const all = await r.json() || []
      const note = {
        id: `N-${Date.now()}`,
        title: title + ' — ' + new Date().toISOString().slice(0,10),
        type: 'agent',
        tags: ['agent-generated', agent],
        content: result,
        excerpt: result.slice(0, 120) + '…',
        updated: new Date().toISOString().slice(0,10),
      }
      await fetch(`${API}/notes`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify([note, ...all]) })
      setSavedTo(true)
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="glass rounded-xl overflow-hidden border border-accent/40 flex flex-col"
      style={{ borderColor: 'rgba(88,101,242,0.4)' }}>
      <div className="px-4 py-3 bg-bg-elevated border-b border-border">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent" />
            <h3 className="font-semibold text-text">{title}</h3>
          </div>
          {hasVoice && (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMic}
                className={`px-3 py-1 rounded-full text-sm flex items-center gap-1.5 border ${listening ? 'bg-danger text-white' : 'text-white'}`}
                style={listening ? { background:'#ef4444', borderColor:'#ef4444' } : { background:'#5865f2', borderColor:'transparent' }}
                title={listening ? 'Остановить' : 'Говорить'}
              >🎙 {listening ? 'Записываю...' : '🎙 Говорить'}</button>
              {/* Native recorder: label+input pair works on mobile Chrome (opens system mic).
                  Input kept renderable (label needs it) but visually hidden. */}
              <label
                htmlFor="apollo-voice-files"
                className="px-3 py-1 rounded-full text-sm border border-border text-text-muted hover:text-text hover:bg-bg-elevated cursor-pointer"
                title="Открыть системный диктофон / выбрать файл"
              >🗒 Запись</label>
              <input
                id="apollo-voice-files"
                ref={fileRef}
                type="file"
                accept="audio/*"
                capture="environment"
                style={{ position:'absolute', opacity:0, width:'1px', height:'1px', pointerEvents:'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  setListening(false)
                  if (f) {
                    const ext = (f.name.match(/\.(\w+)$/)||[])[1] || 'webm'
                    await sendAudio(f, ext)
                  }
                }}
              />
            </div>
          )}
        </div>
        {subtitle && <p className="text-xs text-text-muted mt-1">{subtitle}</p>}
        {description && <p className="text-xs text-text-muted mt-1 opacity-80">{description}</p>}
      </div>

      {fields.map(f => (
        <div key={f.name} className="px-4 py-2.5">
          <label className="block text-xs text-text-muted mb-1">{f.label}</label>
          {f.type === 'textarea' ? (
            <textarea
              value={values[f.name]}
              onChange={e => set(f.name, e.target.value)}
              placeholder={f.placeholder || ''}
              rows={f.rows || 3}
              className="w-full bg-bg-card border border-border rounded-lg p-2 text-sm text-text placeholder-text-muted focus:outline-none focus:border-accent resize-y"
              style={{ minHeight: '60px' }}
            />
          ) : (
            <input
              value={values[f.name]}
              onChange={e => set(f.name, e.target.value)}
              placeholder={f.placeholder || ''}
              className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:border-accent"
            />
          )}
        </div>
      ))}

      <div className="px-4 pt-1 pb-3">
        {/* Mode switch + summary */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 flex items-center gap-0.5 bg-bg-card border border-border rounded-lg p-0.5">
            <button
              onClick={() => setMode('fast')}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'fast' ? 'text-white' : 'text-text-muted hover:text-text'}`}
              style={mode === 'fast' ? { background: '#5865f2' } : {}}
              title="Быстрый режим: ответ за 1-3 сек, без интернета и файлов"
            >⚡ Быстрый</button>
            <button
              onClick={() => setMode('agent')}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'agent' ? 'text-white' : 'text-text-muted hover:text-text'}`}
              style={mode === 'agent' ? { background: '#10b981' } : {}}
              title="Полный агент: ищет в интернете, читает файлы, но 20-40 сек"
            >🤖 Агент</button>
          </div>
        </div>
        {mode === 'fast' ? (
          <p className="text-[10px] text-text-muted mb-3 leading-relaxed">
            <b>⚡ Быстрый</b> — ответ за 1-3 сек. Просто генерирует текст из того, что модель знает. Без интернета и файлов. Для обычных задач.
          </p>
        ) : (
          <p className="text-[10px] text-text-muted mb-3 leading-relaxed">
            <b>🤖 Агент</b> — полный доступ: ищет в интернете, читает файлы дашборда. Медленнее (20-40 сек), но ответ актуальный и точный.
          </p>
        )}
        <button
          onClick={run}
          disabled={busy}
          className="w-full py-3 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: 'linear-gradient(180deg,#6a7bff,#5865f2)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="6 3 20 12 6 21" transform="rotate(-180 13 12)" />
          </svg>
          {busy ? 'Работает...' : submitLabel}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 mb-2 text-xs text-danger bg-danger/10 rounded-lg">⚠ {error}</div>
      )}

      {result !== null && (
        <div ref={resultRef} className="mx-3 mt-1 mb-3 bg-bg-elevated rounded-lg overflow-hidden"
          style={{ border: '1px solid #2a2f3a' }}>
          <div className="flex items-center justify-between px-3 py-1.5 bg-bg-elevated border-b border-border">
            <span className="text-xs font-semibold text-success">✓ {outputTitle}</span>
            <div className="flex items-center gap-2">
              {elapsed != null && <span className="text-xs text-text-muted">{elapsed}s</span>}
              <button onClick={copyResult}
                className="px-2 py-0.5 rounded text-xs text-text-muted hover:text-text hover:bg-bg-card border border-border"
                title="Копировать">Копировать</button>
              <button onClick={speakResult} disabled={ttsBusy}
                className="px-2 py-0.5 rounded text-xs text-text-muted hover:text-text hover:bg-bg-card border border-border"
                title="Озвучить">{ttsBusy ? '…' : '🔊'}</button>
              <button onClick={saveToNotes}
                className="px-2 py-0.5 rounded text-xs border transition-colors"
                style={{ borderColor: savedTo ? '#10b981' : '#2f81f7', color: savedTo ? '#10b981' : '#2f81f7' }}
                title="Сохранить в базу знаний">{savedTo ? '✓ Сохранено в заметки' : 'Сохранить в заметки'}</button>
            </div>
          </div>
          <pre className="p-3 overflow-auto max-h-[420px] text-xs text-text whitespace-pre-wrap break-words">{result}</pre>
        </div>
      )}
    </div>
  )
}