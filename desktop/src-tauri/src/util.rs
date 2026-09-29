//! Логика, которую можно проверить без GTK/webkit: разбор адреса сервера и подготовка текста
//! уведомления. Всё остальное (окно, трей, горячие клавиши) — тонкая обвязка Tauri поверх
//! этих функций, и выносить её отсюда незачем.

/// Допустимые адреса панели: только https (http — только для локальной отладки) и без путей,
/// чтобы случайно не подставить ссылку внутрь.
pub fn normalize_server_url(input: &str) -> Result<String, String> {
    let raw = input.trim().trim_end_matches('/').to_string();
    if raw.is_empty() {
        return Err("пустой адрес".to_string());
    }
    let (scheme, rest) = match raw.split_once("://") {
        Some((s, r)) => (s.to_ascii_lowercase(), r.to_string()),
        None => return Err("адрес должен начинаться с https://".to_string()),
    };
    if scheme != "https" && scheme != "http" {
        return Err(format!("схема {scheme} не поддерживается, нужен https"));
    }
    if rest.is_empty() {
        return Err("в адресе нет домена".to_string());
    }
    if rest.contains('/') {
        return Err("в адресе не должно быть пути — укажите только домен".to_string());
    }
    if rest.contains(' ') {
        return Err("в адресе не должно быть пробелов".to_string());
    }
    Ok(format!("{scheme}://{rest}"))
}

/// Текст уведомления: системный трей обрезает длинные строки сам и молча, поэтому режем
/// заранее и ставим многоточие — иначе уведомление выглядит оборванным на полуслове.
pub fn notify_text(text: &str, max: usize) -> String {
    let t = text.trim();
    let count = t.chars().count();
    if count <= max {
        return t.to_string();
    }
    let mut out: String = t.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

/// Заголовок уведомления по умолчанию, если панель его не задала.
pub fn notify_title(provided: &str) -> String {
    let t = notify_text(provided, 60);
    if t.is_empty() { "Life OS".to_string() } else { t }
}

/// Нормализация сочетания клавиш из настроек в формат Tauri.
/// Принимаем «Ctrl+Alt+Space», «Control+Shift+L» и т.п. Нераспознанное отбрасываем,
/// чтобы приложение не падало из-за одной неверной строки в конфиге.
pub fn normalize_shortcut(input: &str) -> Option<String> {
    let parts: Vec<String> = input
        .split(['+', '-'])
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.len() < 2 {
        return None;
    }
    let mut mods: Vec<&str> = Vec::new();
    let mut key: Option<String> = None;
    for p in parts {
        let low = p.to_ascii_lowercase();
        match low.as_str() {
            "ctrl" | "control" => mods.push("CTRL"),
            "alt" => mods.push("ALT"),
            "shift" => mods.push("SHIFT"),
            "super" | "meta" | "cmd" => mods.push("SUPER"),
            _ => key = Some(canonical_key(&low)),
        }
    }
    let key = key?;
    if mods.is_empty() {
        return None;
    }
    // Tauri ждёт модификаторы в фиксированном порядке, иначе хоткей не совпадёт.
    let mut ordered: Vec<&str> = Vec::new();
    for m in ["CTRL", "ALT", "SHIFT", "SUPER"] {
        if mods.contains(&m) {
            ordered.push(m);
        }
    }
    Some(format!("{}+{}", ordered.join("+"), key))
}

fn canonical_key(low: &str) -> String {
    match low {
        "space" => "Space".to_string(),
        "esc" | "escape" => "Escape".to_string(),
        "enter" | "return" => "Enter".to_string(),
        "tab" => "Tab".to_string(),
        other => {
            // одна буква или цифра — приводим к виду KeyA / Digit1, как ждёт Tauri
            let mut chars = other.chars();
            match (chars.next(), chars.next()) {
                (Some(c), None) if c.is_ascii_alphabetic() => format!("Key{}", c.to_ascii_uppercase()),
                (Some(c), None) if c.is_ascii_digit() => format!("Digit{c}"),
                _ => other.to_string(),
            }
        }
    }
}

/// Закрывать ли окно по крестику: с треем — прячем, без трея — закрываем как обычно.
/// Иначе на системе без трея (другой WM) приложение «пропадает» без следа.
pub fn hide_on_close(tray_available: bool) -> bool {
    tray_available
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn адрес_нормализуется() {
        assert_eq!(normalize_server_url("https://lifeos.dktunnel.xyz").unwrap(),
                   "https://lifeos.dktunnel.xyz");
        assert_eq!(normalize_server_url("  https://lifeos.dktunnel.xyz/  ").unwrap(),
                   "https://lifeos.dktunnel.xyz");
    }

    #[test]
    fn плохой_адрес_отвергается() {
        assert!(normalize_server_url("").is_err());
        assert!(normalize_server_url("lifeos.dktunnel.xyz").is_err(), "нет схемы");
        assert!(normalize_server_url("ftp://example.com").is_err(), "чужая схема");
        assert!(normalize_server_url("https://example.com/panel").is_err(), "есть путь");
    }

    #[test]
    fn длинный_текст_обрезается_с_многоточием() {
        assert_eq!(notify_text("коротко", 20), "коротко");
        let long = "а".repeat(50);
        let cut = notify_text(&long, 10);
        assert_eq!(cut.chars().count(), 10);
        assert!(cut.ends_with('…'));
    }

    #[test]
    fn пустой_заголовок_заменяется() {
        assert_eq!(notify_title("  "), "Life OS");
        assert_eq!(notify_title("Агент ответил"), "Агент ответил");
    }

    #[test]
    fn хоткей_приводится_к_формату_tauri() {
        assert_eq!(normalize_shortcut("Ctrl+Alt+Space").unwrap(), "CTRL+ALT+Space");
        assert_eq!(normalize_shortcut("ctrl + shift + l").unwrap(), "CTRL+SHIFT+KeyL");
        assert_eq!(normalize_shortcut("Meta+1").unwrap(), "SUPER+Digit1");
        // порядок модификаторов не должен зависеть от порядка в строке
        assert_eq!(normalize_shortcut("Alt+Ctrl+K").unwrap(), normalize_shortcut("Ctrl+Alt+K").unwrap());
    }

    #[test]
    fn хоткей_без_модификатора_или_с_пробелами_отбрасывается() {
        assert!(normalize_shortcut("Space").is_none(), "без модификатора");
        assert!(normalize_shortcut("").is_none());
    }
}
