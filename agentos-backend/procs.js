// Список процессов сервера с разбором «что это и нужно ли оно ещё».
//
// Зачем: движки (codex, claude, openclaw) умеют оставлять после себя фоновые демоны. Те стоят
// со PPID=1 (никто их не сторожит), переживают удаление движка и месяцами держат сотни мегабайт.
// Ни список сессий tmux, ни список файлов их не показывают — в панели они были не видны вообще.
//
// Ключевая проверка — /proc/<pid>/exe. Если ссылка заканчивается на « (deleted)», значит запущен
// бинарник, которого на диске уже нет: именно так выглядели два демона codex после удаления.

import fs from 'fs'
import path from 'path'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execP = promisify(execFileCb)

// Процессы, которые нельзя убивать ни через что: убийство сломает панель, сервер или загрузку.
const PROTECTED_NAMES = new Set([
  'systemd', 'init', 'kthreadd', 'sshd', 'cron', 'bash', 'sh', 'dbus-daemon', 'agetty',
  'dockerd', 'containerd', 'containerd-shim', 'tmux', 'sleep', 'ps', 'grep', 'awk', 'sed',
  'cat', 'tail', 'head', 'multipathd', 'polkitd', 'rsyslogd', 'udevd', 'getty',
])
// Имена, которые начинаются с этих — тоже служебные (systemd-journald, dbus-broker, …).
// Раньше проверка была по точному имени, и systemd-journal попадал в «подозрительные».
const PROTECTED_PREFIXES = ['systemd-', 'dbus-', 'polkit', 'sshd-', 'gnome-', 'gdm-', 'xfs']

// Юниты, чьи дети — агентские процессы (tmux-сессии Life OS, шлюзут Hermes). Такие можно
// завершать: это ровно тот случай, когда зависший агент надо убрать руками.
const AGENT_UNITS = /^(lifeos|hermes)/

// Агенты: процессы движков Hermes/OpenCode/Codex. Они законные, даже если PPID=1 (их породил
// tmux-сервер, а тот — init). Считать их мусором нельзя, иначе список врёт.
const AGENT_RE = /\b(hermes|opencode|openclaw|codex|claude)\b|\/\.hermes\/|\/\.opencode\/|\/\.codex\/|tmux -L lifeos/

// Наши собственные: Life OS (бэкенд и статика) и keeper-сессия tmux. Их убийство = дашборд лёг.
const OURS = [
  { pidFile: '/run/lifeos-backend.pid', why: 'бэкенд Life OS' },
  { name: 'lifeos-stack', why: 'супервизор Life OS' },
  { name: 'serve', why: 'отдача статики Life OS' },
]

function readProc(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    // comm может содержать пробелы и скобки: имя — в круглых скобках, дальше поля с позиции после ')'
    const rp = stat.lastIndexOf(')')
    const name = stat.slice(stat.indexOf('(') + 1, rp)
    const rest = stat.slice(rp + 2).split(' ')
    const fields = {
      state: rest[0],
      ppid: Number(rest[1]),
      utime: Number(rest[11]),
      stime: Number(rest[12]),
      starttime: Number(rest[19]),
    }
    let rssKb = 0
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8')
      const m = status.match(/VmRSS:\s+(\d+) kB/)
      if (m) rssKb = Number(m[1])
    } catch {}
    return { name, ...fields, rssKb }
  } catch { return null }
}

function procCmd(pid, name) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    const cmd = raw.split('\0').filter(Boolean).join(' ')
    return cmd || name
  } catch { return name }
}

// Главная проверка: файл программы удалён с диска, а процесс продолжает жить.
function exeState(pid) {
  let target = null
  try { target = fs.readlinkSync(`/proc/${pid}/exe`) } catch { return { exe: null, missing: false } }
  const missing = /\(deleted\)$/.test(target)
  return { exe: target.replace(/\s*\(deleted\)$/, ''), missing }
}

function bootTimeSec() {
  try {
    const b = fs.readFileSync('/proc/stat', 'utf8').match(/^btime\s+(\d+)$/m)
    return b ? Number(b[1]) : 0
  } catch { return 0 }
}

// Какой это юнит systemd. Читается из cgroup: у настоящих служб путь оканчивается на
// «.service» (/system.slice/udisks2.service), а у бесхозных демонов (вроде бывших демонов
// codex) юнита нет вовсе. Это и есть честный признак «служба» против «никто не сторожит».
function systemdUnit(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/cgroup`, 'utf8')
    const m = raw.match(/([^/\s]+\.service)(?:\s|$)/m)
    return m ? m[1] : null
  } catch { return null }
}

function isProtected(name) {
  return PROTECTED_NAMES.has(name) || PROTECTED_PREFIXES.some(x => name.startsWith(x))
}

function userName(uid) {
  try {
    const line = fs.readFileSync('/etc/passwd', 'utf8').split('\n')
      .find(l => l.split(':')[2] === String(uid))
    return line ? line.split(':')[0] : String(uid)
  } catch { return String(uid) }
}

// Наши PID: чтобы защитить себя самим (и не убить собственную панель, даже если имя совпадёт).
function ownPids() {
  const out = new Set([process.pid, process.ppid, 1])
  for (const p of OURS) {
    if (p.pidFile) { try { out.add(Number(fs.readFileSync(p.pidFile, 'utf8').trim())) } catch {} }
  }
  return out
}

function isOurs(name, cmd) {
  return OURS.some(o => (o.name && (name === o.name || cmd.includes(o.name))) || false)
}

// Юнит, в котором живём мы сами (панель). Определяется один раз при загрузке модуля.
const MY_UNIT = systemdUnit(process.pid)

export async function listProcesses() {
  const pids = fs.readdirSync('/proc').filter(n => /^\d+$/.test(n))
  const myUnit = MY_UNIT
  const btime = bootTimeSec()
  const hz = 100 // Linux USER_HZ; uptime в тиках ядра
  const now = Date.now() / 1000
  const self = ownPids()
  const out = []

  for (const pidStr of pids) {
    const pid = Number(pidStr)
    const p = readProc(pid)
    if (!p || !p.rssKb) continue
    const cmd = procCmd(pid, p.name)
    const { exe, missing } = exeState(pid)
    const elapsedSec = btime ? Math.max(0, now - (btime + p.starttime / hz)) : 0
    const cpuSec = (p.utime + p.stime) / hz

    // Классификация: что это вообще такое. Без неё «подозрительными» становились и агенты, и
    // служебные службы — список в 15 строк бесполезен.
    const protectedName = isProtected(p.name)
    const isAgent = !protectedName && AGENT_RE.test(cmd)
    const mine = isOurs(p.name, cmd)
    // Приоритет юнита: если процесс принадлежит systemd-службе, он по определению под
    // присмотром, даже если PPID=1 и даже если список имён его не знает.
    const unit = systemdUnit(pid)
    // Свой юнит определяем один раз: всё, что живёт рядом с нами в том же systemd-юните, — это
    // сама панель (бэкенд, статика, супервизор), и трогать его нельзя. Без этой проверки
    // backend считался бы «агентским» и его можно было бы убить кнопкой.
    const sameUnit = !!myUnit && unit === myUnit
    const kind = mine || sameUnit ? 'lifeos'
      : unit && AGENT_UNITS.test(unit) ? 'agent'
      : unit ? 'service'
      : protectedName ? 'system'
      : isAgent ? 'agent'
      : 'app'

    // Разведём два разных случая «файла нет на диске»:
    //  * служба systemd, запущенная ДО обновления пакета (python3 → python3.14, новый systemd) —
    //    это норма для долгого аптайма, она перезапустится сама. Бить её нельзя и незачем;
    //  * бесхозный демон удалённого движка (codex) — вот это мусор, держит сотни мегабайт.
    // Если не разделить, список показывает 4 «страшных» процесса, которые трогать нельзя, и
    // настоящий мусор в нём теряется.
    const isService = kind === 'service' || kind === 'system'
    const flags = []
    let note = ''
    if (missing) {
      if (isService) note = 'обновлён, а процесс со старой версии — перезапустится при перезагрузке'
      else flags.push('deleted-exe')
    }
    // «Осиротевший» имеет смысл только для обычных программ: агентов породил tmux, службы — systemd
    if (p.ppid === 1 && kind === 'app') flags.push('detached')
    if (elapsedSec > 12 * 3600 && cpuSec < 5 && kind === 'app') flags.push('idle-long')

    out.push({
      pid,
      ppid: p.ppid,
      name: p.name,
      cmd: cmd.length > 220 ? cmd.slice(0, 220) + '…' : cmd,
      user: userName(fs.statSync(`/proc/${pid}`).uid),
      state: p.state,
      rssMb: Math.round(p.rssKb / 1024),
      cpuSec: Math.round(cpuSec * 10) / 10,
      elapsedSec: Math.round(elapsedSec),
      exe,
      exeMissing: missing,
      note,
      // Служба на старой версии после обновления — к мусору не относим, но показываем отдельно
      staleService: missing && isService,
      kind,
      unit,
      isOurs: mine,
      isSelf: self.has(pid),
      // Службу systemd убивать из панели нельзя: её поднимет заново юнит, и это неявное
      // «сделать систему хуже». Для этого есть systemctl.
      canKill: !self.has(pid) && kind !== 'system' && kind !== 'service' && kind !== 'lifeos',
      // Пояснение для интерфейса: почему нельзя завершить.
      notKillableBecause: mine || sameUnit ? 'это процесс самой панели'
        : protectedName && !unit ? `системный процесс (${p.name})`
        : unit && !AGENT_UNITS.test(unit) ? `служба systemd: ${unit}`
        : null,
      flags,
    })
  }

  out.sort((a, b) => b.rssMb - a.rssMb)
  const suspicious = out.filter(p => p.flags.includes('deleted-exe') || p.flags.includes('detached'))
  return {
    total: out.length,
    stats: {
      total: out.length,
      rssMb: out.reduce((s, p) => s + p.rssMb, 0),
      suspicious: suspicious.length,
      deletedExe: out.filter(p => p.flags.includes('deleted-exe')).length,
      staleServices: out.filter(p => p.staleService).length,
      detached: out.filter(p => p.flags.includes('detached')).length,
    },
    suspicious,
    processes: out,
    generatedAt: new Date().toISOString(),
  }
}

// Завершить процесс. Отказ для защищённых — с объяснением, а не молчаливый 403.
export async function killProcess(pid) {
  const n = Number(pid)
  if (!Number.isInteger(n) || n <= 1) return { ok: false, error: 'некорректный PID' }
  const p = readProc(n)
  if (!p) return { ok: false, error: 'процесс не найден' }
  const cmd = procCmd(n, p.name)
  if (ownPids().has(n)) return { ok: false, error: 'нельзя: это процесс самой панели или система' }
  if (isProtected(p.name)) return { ok: false, error: `нельзя: ${p.name} — системный процесс` }
  if (isOurs(p.name, cmd)) return { ok: false, error: 'нельзя: это процесс Life OS' }

  try {
    process.kill(n, 'SIGTERM')
  } catch (e) {
    return { ok: false, error: 'не удалось отправить SIGTERM: ' + e.message }
  }
  // Мягко: если через 3 с процесс ещё жив и сам себя не убрал — это нормально для демонов,
  // сообщаем честно, добивать будем только по явному повторному действию с force.
  await new Promise(r => setTimeout(r, 3000))
  let alive = true
  try { process.kill(n, 0); } catch { alive = false }
  return {
    ok: true,
    forced: false,
    stillAlive: alive,
    note: alive
      ? 'процесс получил SIGTERM, но ещё жив — возможно, он его игнорирует'
      : 'процесс завершён',
    name: p.name,
  }
}

export async function killProcessForced(pid) {
  const n = Number(pid)
  if (!Number.isInteger(n) || n <= 1) return { ok: false, error: 'некорректный PID' }
  const p = readProc(n)
  if (!p) return { ok: false, error: 'процесс не найден' }
  const cmd = procCmd(n, p.name)
  if (ownPids().has(n)) return { ok: false, error: 'нельзя: это процесс самой панели или система' }
  if (isProtected(p.name)) return { ok: false, error: `нельзя: ${p.name} — системный процесс` }
  if (isOurs(p.name, cmd)) return { ok: false, error: 'нельзя: это процесс Life OS' }
  try { process.kill(n, 'SIGKILL') } catch (e) { return { ok: false, error: e.message } }
  return { ok: true, forced: true, note: 'процесс убит (SIGKILL)', name: p.name }
}
