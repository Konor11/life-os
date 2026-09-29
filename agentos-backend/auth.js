// Авторизация Life OS: логин/пароль, заданные при установке, + смена в Настройках.
//
// Что и зачем:
//  * пароль НИКОГДА не хранится открытым — только scrypt-хеш с солью в /root/.lifeos/auth.json
//    (0600, вне репозитория; бэкап панели его не касается);
//  * сессия — подписанная HMAC-кука, без хранилища сессий: после перезапуска панели вход
//    сохраняется, а смена пароля обесценивает старые куки автоматически (секрет = сам хеш);
//  * если файла нет — авторизация выключена (свежий запуск до настройки), и панель показывает
//    экран первоначальной настройки, где админ задаёт логин и пароль.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const AUTH_FILE = process.env.LIFEOS_AUTH_FILE || '/root/.lifeos/auth.json'
const COOKIE = 'lifeos_session'
const SESSION_DAYS = 30
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

let cache = null          // { login, salt, hash } | null
let cacheMtime = 0

function fileStamp() {
  try { return fs.statSync(AUTH_FILE).mtimeMs } catch { return 0 }
}

// Читаем логин/хеш (для проверки пароля и подписи сессии). Файл перечитываем при изменении —
// чтобы смена пароля из Настроек (или из консоли) подхватывалась сразу.
// Страховка от тихой потери учётных данных. Если файл был создан, а потом исчез (кто-то удалил
// руками, откат, обслуживание) — пишем в журнал ЗА МЕСТО САМОГО бэкенда, чтобы это всплыло
// сразу. Метка-обвинитель живёт отдельно и не удаляется вместе с auth.json.
const SEEN_FILE = '/root/.lifeos/.auth-created'
function warnIfAuthVanished(st) {
  if (st !== 0) return
  try {
    if (!existsSync(SEEN_FILE)) return
    console.error('[auth] ВНИМАНИЕ: /root/.lifeos/auth.json исчез, хотя раньше создавался. ' +
      'Вход в панель отключён до новой настройки. Если это не вы — проверьте, что удалило файл.')
  } catch {}
}

export function creds() {
  const st = fileStamp()
  if (st === 0) { cache = null; cacheMtime = 0; warnIfAuthVanished(0); return null }
  if (cache && st === cacheMtime) return cache
  try {
    const raw = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'))
    if (!raw || !raw.login || !raw.salt || !raw.hash) return null
    cache = { login: String(raw.login), salt: String(raw.salt), hash: String(raw.hash) }
    cacheMtime = st
    return cache
  } catch {
    return null
  }
}

export function authRequired() { return !!creds() }

function scrypt(password, saltHex) {
  return crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), SCRYPT.keylen, SCRYPT).toString('hex')
}

export function verifyPassword(login, password) {
  const c = creds()
  if (!c) return false
  if (String(login || '') !== c.login) {
    // Считаем хеш всё равно — чтобы по времени ответа нельзя было перебором логинов понять,
    // какие существуют.
    scrypt(password, c.salt)
    return false
  }
  const got = Buffer.from(scrypt(password, c.salt), 'hex')
  const want = Buffer.from(c.hash, 'hex')
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

export function setCredentials(login, password) {
  const l = String(login || '').trim()
  const p = String(password || '')
  if (!l) throw new Error('пустой логин')
  if (p.length < 8) throw new Error('пароль короче 8 символов')
  const salt = crypto.randomBytes(16).toString('hex')
  const rec = { login: l, salt, hash: scrypt(p, salt), createdAt: new Date().toISOString(), version: 1 }
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true, mode: 0o700 })
  fs.writeFileSync(AUTH_FILE, JSON.stringify(rec, null, 2), { mode: 0o600 })
  try { fs.chmodSync(AUTH_FILE, 0o600) } catch {}
  // метка «учётные данные когда-то создавались» — переживает удаление самого файла
  try { fs.writeFileSync(SEEN_FILE, new Date().toISOString() + ' ' + l + '\n', { mode: 0o600 }) } catch {}
  cache = null; cacheMtime = 0
  return { login: l }
}

const b64u = (buf) => Buffer.from(buf).toString('base64url')

export function issueToken(login) {
  const c = creds()
  if (!c) return null
  const payload = b64u(JSON.stringify({ l: login, e: Date.now() + SESSION_DAYS * 86400000 }))
  const sig = b64u(crypto.createHmac('sha256', c.hash).update(payload).digest())
  return `${payload}.${sig}`
}

export function verifyToken(token) {
  const c = creds()
  if (!c || !token || typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const payload = token.slice(0, dot), sig = token.slice(dot + 1)
  const want = b64u(crypto.createHmac('sha256', c.hash).update(payload).digest())
  if (sig.length !== want.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data || data.l !== c.login) return null
    if (!data.e || Date.now() > data.e) return null
    return data
  } catch { return null }
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

// Guard для express: пропускаем /api/auth/* (иначе не войти) и режим без настроенного пароля.
export function authGuard(req, res, next) {
  if (!authRequired()) return next()
  if (req.path && req.path.startsWith('/api/auth/')) return next()
  const s = sessionFromReq(req)
  if (s) {
    req.lifeosUser = s.l
    return next()
  }
  res.status(401).json({ error: 'требуется вход', auth: true })
}

// То же для WebSocket: сокет TUI идёт мимо express, поэтому проверяем куку на upgrade.
export function wsAllowed(req) {
  if (!authRequired()) return true
  return !!verifyToken(readCookie(req.headers?.cookie))
}

// Явный сброс входа (удаление учётных данных) — снимает и метку, чтобы не пугать в журнале.
export function clearAuth() {
  try { fs.rmSync(AUTH_FILE, { force: true }) } catch {}
  try { fs.rmSync(SEEN_FILE, { force: true }) } catch {}
  cache = null; cacheMtime = 0
}

export const AUTH_FILE_PATH = AUTH_FILE
export const COOKIE_NAME = COOKIE
