// Мост «тема Omarchy → панель».
//
// Приложение живёт на компьютере, панель — на сервере. Поэтому чтение темы и отправка
// разнесены: мост ниже (вызывается из Rust) достаёт палитру и сам ходит в панель
// через сессионную cookie, которая у веб-окна уже есть. Отдельный токен не нужен.
//
// Мост внедряется только в настольное окно — в обычном браузере он не выполняется,
// и Life OS на телефоне ничего лишнего не опрашивает.

(function () {
  if (!window.__TAURI__ || !window.__TAURI__.core || !window.__TAURI__.core.invoke) return;

  const post = async (colors, name) => {
    const payload = Object.assign({ source: 'omarchy', name: name || null }, colors);
    try {
      const r = await fetch('/api/theme/desktop', {
        method: 'POST',
        credentials: 'include',            // сессионная cookie — как у остальных запросов панели
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) console.warn('[lifeos] палитра не принята:', r.status);
    } catch (e) {
      // Панель недоступна — это нормально, когда сервер выключен. Молча продолжаем.
    }
  };

  // Отпечаток палитры: отправляем только если она реально изменилась, иначе смена
  // окна фокуса не порождает лишних запросов.
  let last = '';
  let timer = null;

  async function poll() {
    let t = null;
    try {
      t = await window.__TAURI__.core.invoke('read_system_theme');
    } catch (e) {
      return;                              // команды нет или Omarchy не установлен
    }
    if (!t || !t.colors) return;
    const sig = JSON.stringify(t.colors);
    if (sig === last) return;
    last = sig;
    await post(t.colors, t.name);
  }

  function start() {
    poll();
    clearInterval(timer);
    // 15 секунд: тема Omarchy меняется через omarchy-theme-set, отдельного события нет,
    // а фоновая проверка файла дешевле, чем перезапуск приложения.
    timer = setInterval(poll, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll() });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
