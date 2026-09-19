// SystemStrip — живой статус Agent OS (хост, аптайм, CPU, память, модели).
export function SystemStrip({ status = null }) {
  if (!status) return null
  const up = Math.floor((status.uptime || 0) / 3600)
  const cpu = status.cpuLoad?.[0]
  const cpuTxt = cpu == null ? '—' : (Math.round(cpu * 10) / 10) + ''
  const rss = status.mem?.rss ? Math.round(status.mem.rss / 1024 / 1024) : null

  return (
    <div className="glass rounded-xl p-3 mb-4 border border-accent/30"
      style={{ borderColor: 'rgba(88,101,242,0.35)' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${status.openrouter === 'configured' ? 'bg-success' : 'bg-danger'}`} />
        <h3 className="text-sm font-semibold text-text">System status</h3>
        <span className="text-xs text-text-muted ml-auto">🟢 {status.host}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip label="Uptime" value={`${up} ч`} />
        <Chip label="CPU" value={cpuTxt} />
        <Chip label="RAM" value={rss ? `${rss} МБ` : '—'} />
        <Chip label="Провайдер" value={status.openrouter === 'configured' ? 'OpenRouter ✓' : 'не настроен'} />
        <Chip label="Профили" value={`${status.profiles?.length || 0}`} />
        <Chip label="Данные" value={`${status.dataDir?.replace('/root/', '') || '—'}`} />
      </div>
    </div>
  )
}

function Chip({ label, value }) {
  return (
    <div className="px-2.5 py-1 rounded-lg bg-bg-elevated border border-border text-xs">
      <span className="text-text-muted">{label}: </span>
      <span className="text-text font-mono">{value}</span>
    </div>
  )
}