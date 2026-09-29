// Точка входа. Вся логика в lib.rs — так принято в шаблонах Tauri и позволяет использовать
// код из мобильной точки входа, если приложение когда-нибудь соберут под Android/iOS.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lifeos_desktop_lib::run()
}
