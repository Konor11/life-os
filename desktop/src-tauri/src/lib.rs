// Life OS — нативный клиент панели для Linux (Tauri v2).
//
// Панель живёт на сервере, здесь только нативная обвязка: трей, уведомления, горячие клавиши,
// автозапуск. Интерфейс грузится с lifeos.dktunnel.xyz, поэтому обновления панели приезжают
// сразу, без пересборки этого приложения.
//
// Два решения, о которых стоит помнить:
//  * Крестик не закрывает приложение, а прячет окно в трей. Если трея нет (другой WM) —
//    закрывает по-обычному, иначе окно исчезнет без следа (см. util::hide_on_close).
//  * Второй экземпляр не запускается: он просто поднимает уже открытое окно. Иначе каждый
//    горячий ключ создавал бы новую копию приложения.

mod util;

use tauri::{
    menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// ---- Команды, доступные странице панели ----

/// Уведомление ОС. Страница зовёт его из toast(), поэтому в браузере уведомление просто
/// не отправляется, а в приложении всплывает системное.
#[tauri::command]
fn notify(app: AppHandle, title: Option<String>, body: String) -> Result<(), String> {
    let title = util::notify_title(title.as_deref().unwrap_or(""));
    let body = util::notify_text(&body, 240);
    if body.is_empty() {
        return Err("пустой текст уведомления".to_string());
    }
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

/// Что приложение знает о себе — страница спрашивает это, чтобы показывать нативные
/// настройки (автозапуск, версия) только в десктопной сборке.
#[tauri::command]
fn desktop_info(app: AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch().is_enabled().unwrap_or(false);
    Ok(serde_json::json!({
        "isDesktop": true,
        "version": app.package_info().version.to_string(),
        "autostart": autostart,
        "platform": std::env::consts::OS,
    }))
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    let mgr = app.autolaunch();
    let res = if enabled { mgr.enable() } else { mgr.disable() };
    res.map_err(|e| e.to_string())?;
    mgr.is_enabled().map_err(|e| e.to_string())
}

/// Адрес панели, к которому подключено приложение. Панель спрашивает это, чтобы показать
/// пользователю, куда он вошёл (важно, если сервер сменится).
#[tauri::command]
fn server_url(app: AppHandle) -> Result<String, String> {
    // frontend_dist — это Option<FrontendDist>, а не сам FrontendDist: без Option здесь
    // не компилируется. Проверить пришлось реальной сборкой, по документации это неочевидно.
    let cfg = app.config().clone();
    match cfg.build.frontend_dist {
        Some(tauri::utils::config::FrontendDist::Url(u)) => Ok(u.to_string()),
        Some(other) => Err(format!("панель не загружается по адресу: {other:?}")),
        None => Err("адрес панели не задан".to_string()),
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Открыть панель", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Свернуть / развернуть", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
    MenuBuilder::new(app)
        .items(&[&open, &toggle])
        .separator()
        .items(&[&quit])
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // И переменная окружения, и дефолт проходят через normalize_shortcut. Раньше дефолт
    // подставлялся «как есть» (Ctrl+Alt+Space вместо CTRL+ALT+Space), и приложение падало
    // на старте — ровно на этом шаге.
    let shortcut = std::env::var("LIFEOS_HOTKEY")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| util::normalize_shortcut(&s))
        .unwrap_or_else(util::default_shortcut);
    eprintln!("[lifeos] горячая клавиша: {shortcut}");

    let mut builder = tauri::Builder::default();

    // Один экземпляр: второй запуск поднимает уже открытое окно. Регистрируется первым,
    // это требование плагина.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(move |app| {
            let handle = app.handle().clone();

            // ---- Трей ----
            let menu = build_menu(&handle)?;
            TrayIconBuilder::with_id("main-tray")
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .ok_or_else(|| tauri::Error::AssetNotFound("нет иконки приложения".into()))?,
                )
                .tooltip("Life OS")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "toggle" => {
                        if let Some(w) = app.get_webview_window("main") {
                            match w.is_visible() {
                                Ok(true) => {
                                    let _ = w.hide();
                                }
                                _ => show_main(app),
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Левый клик по иконке — показать окно (правый открывает меню сам).
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // ---- Горячая клавиша: показать/спрятать окно из любого приложения ----
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
                // Неудача с горячей клавишей НЕ должна ронять приложение: это удобство,
                // а не условие работы. Раньше ошибка разбора или занятая клавиша валили
                // setup hook, и окно не открывалось вообще.
                match parse_tauri_shortcut(&shortcut) {
                    None => eprintln!(
                        "[lifeos] не понял сочетание «{shortcut}» — приложение запустится без него"
                    ),
                    Some(parsed) => {
                        let handler = app.handle().plugin(
                            tauri_plugin_global_shortcut::Builder::new()
                                .with_handler(move |app, _sc, event| {
                                    if event.state() == ShortcutState::Pressed {
                                        if let Some(w) = app.get_webview_window("main") {
                                            match w.is_visible() {
                                                Ok(true) if w.is_focused().unwrap_or(false) => {
                                                    let _ = w.hide();
                                                }
                                                _ => show_main(app),
                                            }
                                        }
                                    }
                                })
                                .build(),
                        );
                        if let Err(e) = handler {
                            eprintln!("[lifeos] плагин горячих клавиш не загрузился: {e}");
                        } else if let Err(e) = app.global_shortcut().register(parsed) {
                            eprintln!("[lifeos] не смог занять {shortcut} (занято другим?): {e}");
                        } else {
                            eprintln!("[lifeos] горячая клавиша {shortcut} занята приложением");
                        }
                    }
                }
            }

            // ---- Автозапуск ----
            // По умолчанию НЕ включаем: решение пользователя, а не наше. Включается тумблером
            // в Настройках → Безопасность (страница зовёт set_autostart).
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let tray_available = window.app_handle().tray_by_id("main-tray").is_some();
                if util::hide_on_close(tray_available) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            notify,
            desktop_info,
            set_autostart,
            server_url,
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить Life OS");
}

/// Строка вида "CTRL+ALT+Space" → Shortcut. Разбор намеренно свой и узкий: поддерживаем
/// ровно те клавиши, что нужны приложению, и молча игнорируем остальное.
#[cfg(desktop)]
fn parse_tauri_shortcut(s: &str) -> Option<tauri_plugin_global_shortcut::Shortcut> {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    let mut parts = s.split('+');
    let key = parts.next_back()?;
    let mut mods = Modifiers::empty();
    for m in parts {
        match m.trim() {
            "CTRL" => mods |= Modifiers::CONTROL,
            "ALT" => mods |= Modifiers::ALT,
            "SHIFT" => mods |= Modifiers::SHIFT,
            "SUPER" => mods |= Modifiers::SUPER,
            _ => return None,
        }
    }
    let code = match key.trim() {
        "Space" => Code::Space,
        "KeyL" => Code::KeyL,
        "KeyK" => Code::KeyK,
        "KeyD" => Code::KeyD,
        "KeyM" => Code::KeyM,
        "Digit1" => Code::Digit1,
        "Digit2" => Code::Digit2,
        "Escape" => Code::Escape,
        "Enter" => Code::Enter,
        _ => return None,
    };
    Some(Shortcut::new(Some(mods), code))
}
