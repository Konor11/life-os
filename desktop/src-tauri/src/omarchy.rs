//! Разбор темы Omarchy для Life OS Desktop.
//!
//! Формат взят из официальной документации (docs/theming.md в репозитории Omarchy):
//! активная тема лежит в `colors.toml` и содержит смысловые ключи:
//!
//! ```toml
//! mode = "dark"
//! accent = "#7aa2f7"
//! selection = "#292e42"
//! muted = "#414868"
//! background = "#1a1b26"
//! lighter_background = "#24283b"
//! foreground = "#a9b1d6"
//! bright_foreground = "#c0caf5"
//! red = "#f7768e"
//! ```
//!
//! Путь к активной теме: `~/.config/omarchy/current/colors.toml`, где `current` —
//! симлинк на выбранную тему. Во время переключения тема сначала собирается в
//! `current/next-theme`, поэтому проверяем и его — иначе смена темы подхватилась бы
//! с задержкой в один переключатель.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Ключи, которые имеет смысл передавать панели. Полный список смысловых имён из
/// документации плюс legacy-имена (`bg`/`fg`/`color0…15`) для старых тем.
pub const WANTED_KEYS: &[&str] = &[
    "mode",
    "accent",
    "selection",
    "muted",
    "background",
    "dark_background",
    "darker_background",
    "lighter_background",
    "foreground",
    "dark_foreground",
    "light_foreground",
    "bright_foreground",
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "purple",
    "cyan",
    "bright_red",
    "bright_green",
    "bright_yellow",
    "bright_blue",
    "bright_magenta",
    "bright_cyan",
    "bright_white",
    "bright_black",
    "bg",
    "fg",
];

/// Приводит значение к виду `#rrggbb`. Возвращает `None` для мусора, чтобы панель
/// потом не выводила выдуманный цвет.
///
/// Проверка обязана включать САМИ цифры, а не только длину. Раньше длина мерялась в
/// байтах: строка «нет» — ровно 6 байт — проходила как цвет и уходила на панель.
pub fn norm_color(v: &str) -> Option<String> {
    let h: String = v
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim_start_matches('#')
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    if !h.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let digits: String = h.chars().take(8).collect();   // альфа-канал отбрасываем
    let digits = digits.to_ascii_lowercase();
    match digits.len() {
        3 => {
            // Короткая запись #abc → #aabbcc. Канал подставляется ОДИН раз:
            // с двойным подстановлением выходило #ffffffffffff (12 символов).
            let c: Vec<char> = digits.chars().collect();
            let ex = |x: char| format!("{x}{x}");
            Some(format!("#{}{}{}", ex(c[0]), ex(c[1]), ex(c[2])))
        }
        6 => Some(format!("#{digits}")),
        8 => Some(format!("#{}", &digits[..6])),
        _ => None,
    }
}

/// Разбирает `colors.toml`. Поддерживает и `key = "value"`, и `key=value`.
/// Комментарии и пустые строки пропускаются; секции TOML игнорируются —
/// в файле темы их не бывает, а разбирать полный TOML ради одной строки смысла нет.
pub fn parse_colors_toml(src: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for line in src.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') || l.starts_with('[') {
            continue;
        }
        let Some((k, v)) = l.split_once('=') else { continue };
        let key = k.trim().trim_matches('"').to_string();
        if key.is_empty() {
            continue;
        }
        out.insert(key, v.trim().to_string());
    }
    out
}

/// Пути, где может лежать активная тема — в порядке приоритета.
pub fn candidate_paths(home: &Path) -> Vec<PathBuf> {
    let cfg = home.join(".config").join("omarchy");
    vec![
        // Активная тема: current — симлинк на themes/<name>.
        cfg.join("current").join("colors.toml"),
        // Сборка при переключении: сначала сюда, потом current переключается.
        cfg.join("current").join("next-theme").join("colors.toml"),
        // Подстраховка на другое расположение состояния.
        home.join(".local")
            .join("state")
            .join("omarchy")
            .join("current")
            .join("colors.toml"),
    ]
}

/// Имя активной темы — из симлинка `current`, чтобы панель могла показать,
/// какая именно тема пришла.
pub fn current_theme_name(home: &Path) -> Option<String> {
    let cur = home.join(".config").join("omarchy").join("current");
    let target = std::fs::read_link(&cur).ok()?;
    Some(
        target
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default(),
    )
}

/// Что получилось прочитать. `colors` — только ключи из `WANTED_KEYS` плюс `color0…15`.
#[derive(Debug, Default, Clone)]
pub struct OmarchyTheme {
    pub path: Option<PathBuf>,
    pub name: Option<String>,
    pub colors: BTreeMap<String, String>,
}

impl OmarchyTheme {
    /// Годится ли палитра: нужен фон и текст, остальное — по возможности.
    pub fn usable(&self) -> bool {
        self.colors.contains_key("background") || self.colors.contains_key("bg")
    }
}

/// Читает активную тему. `Ok(None)` — Omarchy не установлен или файла нет.
/// Это НЕ ошибка: приложение должно молча работать без панели, если темы нет.
pub fn read_theme(home: &Path) -> Option<OmarchyTheme> {
    let path = candidate_paths(home).into_iter().find(|p| p.is_file())?;
    let src = std::fs::read_to_string(&path).ok()?;
    let raw = parse_colors_toml(&src);

    let mut colors = BTreeMap::new();
    for k in WANTED_KEYS {
        if let Some(v) = raw.get(*k) {
            if let Some(n) = norm_color(v) {
                colors.insert((*k).to_string(), n);
            } else if *k == "mode" {
                let m = v.trim().trim_matches('"').to_lowercase();
                if m == "dark" || m == "light" {
                    colors.insert("mode".into(), m);
                }
            }
        }
    }
    for i in 0..16 {
        if let Some(v) = raw.get(&format!("color{i}")) {
            if let Some(n) = norm_color(v) {
                colors.insert(format!("color{i}"), n);
            }
        }
    }

    Some(OmarchyTheme {
        path: Some(path),
        name: current_theme_name(home),
        colors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Ровно тот пример, что в официальной документации Omarchy.
    // Именно r##"…"##, а не r#"…"#: внутри примера есть строки вида = "#1a1b26",
    // а последовательность "# закрывает raw-строку r#"…"#. Компилятор на этом и спотыкается.
    const DOC_SAMPLE: &str = r##"
mode = "dark"
accent = "#7aa2f7"
selection = "#292e42"
muted = "#414868"
background = "#1a1b26"
dark_background = "#13141c"
darker_background = "#0e0e14"
lighter_background = "#24283b"
foreground = "#a9b1d6"
dark_foreground = "#565f89"
light_foreground = "#b4bee6"
bright_foreground = "#c0caf5"
red = "#f7768e"
blue = "#7aa2f7"
"##;

    #[test]
    fn пример_из_документации_разбирается_целиком() {
        let m = parse_colors_toml(DOC_SAMPLE);
        assert_eq!(m.get("mode").unwrap(), "\"dark\"");
        assert_eq!(m.get("accent").unwrap(), "\"#7aa2f7\"");
        assert_eq!(m.get("background").unwrap(), "\"#1a1b26\"");
    }

    #[test]
    fn цвета_нормируются_к_шести_знакам() {
        assert_eq!(norm_color("#1a1b26").unwrap(), "#1a1b26");
        assert_eq!(norm_color("\"#7aa2f7\"").unwrap(), "#7aa2f7");
        assert_eq!(norm_color("  #FFF ").unwrap(), "#ffffff");   // без решётки и капсом
        assert_eq!(norm_color("#abc").unwrap(), "#aabbcc");        // короткая запись
        assert_eq!(norm_color("#7aa2f7ff").unwrap(), "#7aa2f7");    // с альфой отбрасываем её
    }

    #[test]
    fn мусор_не_превращается_в_цвет() {
        // Панель не должна получать выдуманный цвет вместо отсутствующего.
        assert!(norm_color("").is_none());
        assert!(norm_color("нет").is_none());          // 6 байт кириллицы — не цвет
        assert!(norm_color("#12345").is_none());       // 5 цифр
        assert!(norm_color("{{ placeholder }}").is_none());
        assert!(norm_color("rgb(1,2,3)").is_none());
        assert!(norm_color("#gggggg").is_none());
        assert!(norm_color("null").is_none());
    }

    #[test]
    fn пробелы_и_регистр_не_мешают() {
        assert_eq!(norm_color("  #FFF  ").unwrap(), "#ffffff");
        assert_eq!(norm_color("#7AA2F7").unwrap(), "#7aa2f7");   // капс приводим к нижнему
        assert_eq!(norm_color("\"#1a1b26\"").unwrap(), "#1a1b26");
    }

    #[test]
    fn комментарии_и_секции_не_мешают() {
        let src = "# палитра\n\n[section]\nkey = \"value\"\naccent = \"#7aa2f7\"\n";
        let m = parse_colors_toml(src);
        assert_eq!(m.get("accent").unwrap(), "\"#7aa2f7\"");
        assert!(!m.contains_key("# палитра"));
    }

    #[test]
    fn без_темы_возвращается_none_а_не_ошибка() {
        let tmp = std::env::temp_dir().join("lifeos-no-omarchy-test");
        assert!(read_theme(&tmp).is_none());
    }

    #[test]
    fn путь_берётся_из_активной_темы() {
        let p = candidate_paths(Path::new("/home/dan"));
        assert_eq!(
            p[0],
            PathBuf::from("/home/dan/.config/omarchy/current/colors.toml")
        );
        // Путь сборки при переключении тоже проверяется — иначе смена темы
        // подхватилась бы только после следующего переключения.
        assert!(p.iter().any(|x| x.to_string_lossy().contains("next-theme")));
    }
}
