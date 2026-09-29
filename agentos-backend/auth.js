// Авторизация Life OS: пользователи, роли и вход по логину/паролю.
//
// Устройство (v2, с ролями):
//  * пароль НИКОГДА не хранится открытым — только scrypt-хеш с солью в /root/.lifeos/auth.json
//    (0600, вне репозитория; бэкап данных панели этот файл не затрагивает);
//  * файл: { version: 2, secret, users: [{ login, salt, hash, role, createdAt }] }.
//    Старый формат (один login/salt/hash) автоматически мигрирует в одного админа;
//  * сессия — подписанная HMAC-кука без хранилища сессий. Ключ подписи у каждого пользователя
//    свой (HMAC от общего секрета и его хеша), поэтому смена пароля гасит именно его входы,
//    а удаление пользователя — его тоже;
//  * роль берётся из файла при каждой проверке, а не из куки: понизил права — действует сразу;
//  * если файла нет — входа нет, панель показывает экно первоначальной настройки.
//
// Роли:
//   admin  — всё, включая установку/удаление движков, терминал, файлы, бэкапы, импорт, пользователей
//   user   — работа с данными жизни и чат, но без установки движков, терминала, файлов и бэкапов
//   viewer — только чтение (никаких POST/PUT/DELETE)
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const AUTH_FILE = process.env.LIFEOS_AUTH_FILE || '/root/.lifeos/auth.json'
const SEEN_FILE = '/root/.lifeos/.auth-created'
const COOKIE = 'lifeos_session'
const SESSION_DAYS = 30
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export const ROLES = ['admin', 'user', 'viewer']
export const ROLE_LABELS = {
  admin: 'Администратор — всё, включая терминал и установку движков',
  user: 'Пользователь — работа с данными и чат, без терминала и установки',
  viewer: 'Наблюдатель — только просмотр, ничего изменить нельзя',
}

let cache = null          // { version, secret, users } | null
let cacheMtime = 0

function fileStamp() {
  try { return fs.statSync(AUTH_FILE).mtimeMs } catch { return 0 }
}

// Страховка от тихой потери учётных данных: файл был, а исчез (удалили руками, откат, обслуживание).
// existsSync берём из fs — раньше здесь стоял голый existsSync без импорта, проверка падала в
// try/catch и предупреждение не печаталось никогда.
function warnIfAuthVanished(st) {
  if (st !== 0) return
  try {
    if (!fs.existsSync(SEEN_FILE)) return
    console.error('[auth] ВНИМАНИЕ: /root/.lifeos/auth.json исчез, хотя раньше создавался. ' +
      'Вход в панель отключён до новой настройки. Если это не вы — проверьте, что удалило файл.')
  } catch {}
}

function normalizeUser(u) {
  if (!u || !u.login || !u.salt || !u.hash) return null
  const role = ROLES.includes(u.role) ? u.role : 'user'
  return {
    login: String(u.login),
    salt: String(u.salt),
    hash: String(u.hash),
    role,
    createdAt: u.createdAt || null,
  }
}

export function creds() {
  const st = fileStamp()
  if (st === 0) { cache = null; cacheMtime = 0; warnIfAuthVanished(0); return null }
  if (cache && st === cacheMtime) return cache
  try {
    const raw = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'))
    // v1 → v2: одиночный пользователь становится админом
    if (raw && raw.login && raw.salt && raw.hash) {
      const admin = normalizeUser({ ...raw, role: 'admin' })
      const secret = crypto.randomBytes(32).toString('hex')
      const migrated = { version: 2, secret, users: [admin] }
      fs.writeFileSync(AUTH_FILE, JSON.stringify(migrated, null, 2), { mode: 0o600 })
      cache = migrated
      cacheMtime = fileStamp()
      return cache
    }
    if (!raw || !Array.isArray(raw.users) || !raw.users.length) return null
    const users = raw.users.map(normalizeUser).filter(Boolean)
    if (!users.length) return null
    const secret = String(raw.secret || crypto.randomBytes(32).toString('hex'))
    cache = { version: 2, secret, users }
    cacheMtime = st
    return cache
  } catch {
    return null
  }
}

export function authRequired() { return !!creds() }

export function users() {
  const c = creds()
  return c ? c.users : []
}

export function findUser(login) {
  return users().find(u => u.login === String(login || '')) || null
}

function scrypt(password, saltHex) {
  return crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), SCRYPT.keylen, SCRYPT).toString('hex')
}

// Ключ подписи конкретного пользователя: от общего секрета и его хеша. Смена пароля меняет хеш →
// все его прежние куки перестают проверяться. Общий секрет хранится рядом, но сам по себе бесполезен.
function userKey(u) {
  const c = creds()
  return crypto.createHmac('sha256', c.secret).update(u.hash).digest()
}

export function verifyPassword(login, password) {
  const u = findUser(login)
  if (!u) {
    // Считаем хеш всё равно — по времени ответа нельзя перебором выяснить, какие логины есть.
    crypto.scryptSync(String(password), '00', SCRYPT.keylen, SCRYPT)
    return false
  }
  const got = Buffer.from(scrypt(password, u.salt), 'hex')
  const want = Buffer.from(u.hash, 'hex')
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

function persist(state) {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true, mode: 0o700 })
  fs.writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2), { mode: 0o600 })
  try { fs.chmodSync(AUTH_FILE, 0o600) } catch {}
  try { fs.writeFileSync(SEEN_FILE, new Date().toISOString() + ' ' + state.users.map(u => u.login).join(',') + '\n', { mode: 0o600 }) } catch {}
  cache = null
  cacheMtime = 0
}

function validateLogin(login) {
  const l = String(login || '').trim()
  if (!l) throw new Error('пустой логин')
  if (!/^[A-Za-z0-9_.-]{2,32}$/.test(l)) throw new Error('логин: 2–32 символа, латиница, цифры, «_», «-», «.»')
  return l
}

function validatePassword(password) {
  const p = String(password || '')
  if (p.length < 8) throw new Error('пароль короче 8 символов')
  return p
}

// Первый пользователь — всегда администратор (иначе им некому управлять).
export function setCredentials(login, password) {
  const c = creds()
  if (c) throw new Error('вход уже настроен, добавляйте пользователей в Настройках')
  const l = validateLogin(login)
  const p = validatePassword(password)
  const salt = crypto.randomBytes(16).toString('hex')
  const state = {
    version: 2,
    secret: crypto.randomBytes(32).toString('hex'),
    users: [{ login: l, salt, hash: scrypt(p, salt), role: 'admin', createdAt: new Date().toISOString() }],
  }
  persist(state)
  return { login: l, role: 'admin' }
}

export function addUser(login, password, role) {
  const c = creds()
  if (!c) throw new Error('сначала задайте основной вход')
  const l = validateLogin(login)
  const p = validatePassword(password)
  const r = ROLES.includes(role) ? role : 'user'
  if (findUser(l)) throw new Error('такой логин уже есть')
  const salt = crypto.randomBytes(16).toString('hex')
  const usersNow = [...c.users, { login: l, salt, hash: scrypt(p, salt), role: r, createdAt: new Date().toISOString() }]
  persist({ ...c, users: usersNow })
  return { login: l, role: r }
}

export function setRole(login, role) {
  const c = creds()
  const u = findUser(login)
  if (!u) throw new Error('пользователь не найден')
  if (!ROLES.includes(role)) throw new Error('неизвестная роль')
  if (u.role === 'admin' && role !== 'admin') {
    const admins = c.users.filter(x => x.role === 'admin' && x.login !== login)
    if (!admins.length) throw new Error('нельзя снять роль администратора с последнего администратора')
  }
  persist({ ...c, users: c.users.map(x => (x.login === login ? { ...x, role } : x)) })
  return { login, role }
}

export function setPassword(login, password) {
  const c = creds()
  const u = findUser(login)
  if (!u) throw new Error('пользователь не найден')
  const p = validatePassword(password)
  const salt = crypto.randomBytes(16).toString('hex')
  persist({ ...c, users: c.users.map(x => (x.login === login ? { ...x, salt, hash: scrypt(p, salt) } : x)) })
  return { login }
}

export function removeUser(login) {
  const c = creds()
  const u = findUser(login)
  if (!u) throw new Error('пользователь не найден')
  if (u.role === 'admin' && c.users.filter(x => x.role === 'admin').length === 1) {
    throw new Error('нельзя удалить последнего администратора')
  }
  persist({ ...c, users: c.users.filter(x => x.login !== login) })
  return { login }
}

const b64u = (buf) => Buffer.from(buf).toString('base64url')

export function issueToken(login) {
  const u = findUser(login)
  if (!u) return null
  const payload = b64u(JSON.stringify({ l: u.login, e: Date.now() + SESSION_DAYS * 86400000 }))
  const sig = b64u(crypto.createHmac('sha256', userKey(u)).update(payload).digest())
  return `${payload}.${sig}`
}

export function verifyToken(token) {
  if (!creds() || !token || typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const payload = token.slice(0, dot), sig = token.slice(dot + 1)
  let data
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch { return null }
  if (!data || !data.l || !data.e || Date.now() > data.e) return null
  // Пользователя и его роль берём из файла: удалённый или пониженный сразу теряет доступ.
  const u = findUser(data.l)
  if (!u) return null
  const want = b64u(crypto.createHmac('sha256', userKey(u)).update(payload).digest())
  if (sig.length !== want.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  return { l: u.login, r: u.role }
}

export function readCookie(header, name = COOKIE) {
  const raw = String(header || '')
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

export function cookieHeader(token) {
  const secure = (process.env.LIFEOS_HTTPS || '1') !== '0' ? '; Secure' : ''
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`
}

export function clearCookieHeader() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function sessionFromReq(req) {
  return verifyToken(readCookie(req.headers?.cookie))
}

// ---- разграничение прав ----

// Пути, доступные ТОЛЬКО администратору: установка и удаление движков, обновление, терминал и
// файлы (это root-оболочка на сервере), бэкапы, импорт данных, управление пользователями.
const ADMIN_ONLY = [
  '/api/harness/install', '/api/harness/uninstall', '/api/harness/update',
  '/api/components/install', '/api/components/uninstall',
  '/api/backup/now', '/api/data/import',
  '/api/auth/users', '/api/auth/user',
  '/api/term', '/api/exec', '/api/fs', '/api/file', '/api/upload', '/api/download',
]

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function authGuard(req, res, next) {
  if (!authRequired()) return next()
  if (req.path && req.path.startsWith('/api/auth/')) return next()
  const s = sessionFromReq(req)
  if (!s) return res.status(401).json({ error: 'требуется вход', auth: true })
  req.lifeosUser = s.l
  req.lifeosRole = s.r

  const path = req.path || ''
  if (s.r === 'admin') return next()

  if (s.r === 'viewer' && !READ_METHODS.has(req.method)) {
    return res.status(403).json({ error: 'роль «наблюдатель» — только просмотр', role: 'viewer' })
  }
  if (ADMIN_ONLY.some(p => path.startsWith(p))) {
    return res.status(403).json({
      error: 'недостаточно прав: нужен администратор',
      role: s.r, need: 'admin',
    })
  }
  return next()
}

// Требует администратора (для маршрутов, которые регистрируются отдельно).
export function requireAdmin(req, res, next) {
  if (!authRequired()) return next()
  const s = sessionFromReq(req)
  if (!s) return res.status(401).json({ error: 'требуется вход', auth: true })
  if (s.r !== 'admin') return res.status(403).json({ error: 'нужен администратор', role: s.r, need: 'admin' })
  req.lifeosUser = s.l
  req.lifeosRole = s.r
  next()
}

// То же для WebSocket: сокет TUI идёт мимо express, поэтому проверяем куку на upgrade. Роль
// «user» терминалом не пользоваться не может — терминал доступен только админу.
export function wsAllowed(req) {
  if (!authRequired()) return true
  const s = sessionFromReq(req)
  return !!s && s.r === 'admin'
}

export function clearAuth() {
  try { fs.rmSync(AUTH_FILE, { force: true }) } catch {}
  try { fs.rmSync(SEEN_FILE, { force: true }) } catch {}
  cache = null; cacheMtime = 0
}

export const AUTH_FILE_PATH = AUTH_FILE
export const COOKIE_NAME = COOKIE
