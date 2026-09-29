// Мост между панелью и нативными возможностями десктопного приложения.
//
// Панель одна и та же: и в браузере, и в приложении. Поэтому всё определяется на лету —
// если Tauri есть, зовём нативное API, если нет, тихо ничего не делаем. Никаких проверок
// «а где я вообще запущен» в коде страницы быть не должно.

const tauri = () => (typeof window !== 'undefined' && window.__TAURI__ ? window.__TAURI__ : null)

export function isDesktop() {
  return !!tauri()
}

async function invoke(cmd, args) {
  const t = tauri()
  if (!t || !t.core || typeof t.core.invoke !== 'function') return null
  try {
    return await t.core.invoke(cmd, args)
  } catch (e) {
    // Нативный вызов не прошёл — это не повод ломать страницу: уведомление просто не покажется.
    console.warn('[desktop] команда не удалась:', cmd, e)
    return null
  }
}

/// Уведомление ОС. В браузере возвращает false — там уведомление показывается внутри панели.
export async function nativeNotify(title, body) {
  const r = await invoke('notify', { title: title || null, body: String(body || '') })
  return r !== null
}

/// Сведения о приложении: версия, автозапуск, платформа. null — значит мы в браузере.
export async function desktopInfo() {
  return await invoke('desktop_info')
}

export async function setAutostart(enabled) {
  const r = await invoke('set_autostart', { enabled: !!enabled })
  return r === null ? null : !!r
}

export async function serverUrl() {
  return await invoke('server_url')
}
