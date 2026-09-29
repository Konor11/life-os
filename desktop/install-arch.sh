#!/usr/bin/env bash
# Установка Life OS (десктоп) на Arch Linux.
#
# Что делает:
#   1. Ставит системные зависимости Tauri (webkit2gtk, gtk3, индикатор трея) через pacman.
#   2. Ставит Rust, если его нет.
#   3. Собирает приложение (release + AppImage) и .desktop-файл.
#   4. Кладёт AppImage в ~/Applications и регистрирует его в меню приложений.
#
# Запуск:  bash install-arch.sh
#
# Что скрипт НЕ делает (и почему):
#   * не ставит пакеты из AUR — tauri-cli собирается через cargo, без yay/paru;
#   * не включает автозапуск сам — это решение пользователя, тумблер в Настройках;
#   * не трогает системные службы и не меняет настройки рабочего стола.

set -euo pipefail

BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; OFF=$'\033[0m'
say()  { echo "${BOLD}$*${OFF}"; }
ok()   { echo "${GREEN}✓${OFF} $*"; }
warn() { echo "${YELLOW}!${OFF} $*"; }
die()  { echo "${RED}✗${OFF} $*" >&2; exit 1; }

# --- проверка системы ---
if ! command -v pacman >/dev/null 2>&1; then
  die "Этот скрипт для Arch Linux (нужен pacman). На другой системе зависимости ставятся иначе."
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_DIR="$SRC_DIR/src-tauri"
[ -f "$TAURI_DIR/Cargo.toml" ] || die "не найден $TAURI_DIR/Cargo.toml — запускай скрипт из каталога desktop"

# --- 1. системные зависимости ---
PKGS=(webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg patchelf base-devel curl wget file)
MISSING=()
for p in "${PKGS[@]}"; do pacman -Qq "$p" >/dev/null 2>&1 || MISSING+=("$p"); done

if [ ${#MISSING[@]} -gt 0 ]; then
  say "Ставлю зависимости: ${MISSING[*]}"
  if [ $EUID -ne 0 ]; then
    sudo pacman -S --needed --noconfirm "${MISSING[@]}"
  else
    pacman -S --needed --noconfirm "${MISSING[@]}"
  fi
  ok "зависимости на месте"
else
  ok "все зависимости уже установлены"
fi

# --- 2. Rust ---
if ! command -v cargo >/dev/null 2>&1; then
  say "Ставлю Rust (rustup)"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
  ok "Rust установлен: $(cargo --version)"
else
  ok "Rust уже есть: $(cargo --version)"
fi

# Проверка минимальной версии: плагины автозапуска и горячих клавиш требуют 1.77.2
VER_RAW="$(rustc --version | awk '{print $2}')"
VER_OK=$(printf '%s\n1.77.2\n' "$VER_RAW" | sort -V | head -1)
if [ "$VER_OK" = "1.77.2" ]; then
  ok "версия Rust подходит: $VER_RAW"
else
  die "нужен Rust 1.77.2 или новее (сейчас $VER_RAW). Обнови: rustup update"
fi

# --- 3. сборка ---
say "Собираю приложение. Это надолго: первый build тянет ~400 пакетов и компилирует их минут 20–40."
say "Если прервёшь — просто запусти скрипт снова, соберётся быстрее."
cd "$TAURI_DIR"
cargo build --release || die "сборка не удалась. Покажи последние строки ошибки — разберёмся."

BIN="$TAURI_DIR/target/release/lifeos"
[ -x "$BIN" ] || die "бинарник не найден: $BIN"
ok "собран: $BIN ($(du -h "$BIN" | cut -f1))"

# AppImage: один файл, который запускается на любом дистрибутиве без установки
if command -v cargo-tauri >/dev/null 2>&1; then
  say "Собираю AppImage"
  cargo tauri build --bundles appimage && ok "AppImage готов" || warn "AppImage не собрался — бинарник выше всё равно работает"
else
  warn "tauri-cli не установлен, AppImage пропущен (поставка: cargo install tauri-cli --version '^2')"
fi

# --- 4. установка в меню приложений ---
APPDIR="$HOME/Applications"
mkdir -p "$APPDIR"
if [ -f "$TAURI_DIR/target/release/bundle/appimage/"*.AppImage ]; then
  APPIMAGE=$(ls -1 "$TAURI_DIR/target/release/bundle/appimage/"*.AppImage | head -1)
  install -Dm755 "$APPIMAGE" "$APPDIR/$(basename "$APPIMAGE")"
  ok "AppImage установлен: $APPDIR/$(basename "$APPIMAGE")"
  LAUNCHER="$APPDIR/$(basename "$APPIMAGE")"
else
  # AppImage нет — кладём обычный бинарник и .desktop руками
  install -Dm755 "$BIN" "$HOME/.local/bin/lifeos"
  LAUNCHER="$HOME/.local/bin/lifeos"
  ok "бинарник установлен: $LAUNCHER"
fi

# .desktop: нужен для трея, иконки в меню и оконного менеджера.
# Берём готовый файл из репозитория и только подставляем Exec: так он останется одинаковым
# здесь и в AUR-пакете (раньше ярлык собирался тут же, и две копии разъезжались).
DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"
sed "s|^Exec=.*|Exec=$LAUNCHER|" "$SRC_DIR/packaging/lifeos.desktop" > "$DESKTOP_DIR/lifeos.desktop"
ok "ярлык создан: $DESKTOP_DIR/lifeos.desktop"

# Иконка для меню приложений (если есть чем рисовать)
# Иконки берём из репозитория: 32, 128 и 512 — ровно те, что Tauri уже собрал для трея.
install -Dm644 "$TAURI_DIR/icons/32x32.png"  "$HOME/.local/share/icons/hicolor/32x32/apps/lifeos.png"
install -Dm644 "$TAURI_DIR/icons/128x128.png" "$HOME/.local/share/icons/hicolor/128x128/apps/lifeos.png"
install -Dm644 "$TAURI_DIR/icons/icon.png"     "$HOME/.local/share/icons/hicolor/512x512/apps/lifeos.png"
ok "иконки установлены"

# Обновляем кэш иконок, иначе новая иконка появится только после перезахода
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor 2>/dev/null || true
fi

echo
ok "Готово. Запуск: Life OS в меню приложений или $LAUNCHER"
echo
say "Что дальше:"
echo "  • войди в панель (тот же логин и пароль, что на сервере);"
echo "  • крестик сворачивает приложение в трей, а не закрывает его;"
echo "  • Ctrl+Alt+Space — показать/спрятать окно из любого места;"
echo "  • автозапуск включается тумблером в Настройках → Система → «Настольное приложение»."
echo
echo "Если что-то не собралось — пришли вывод cargo build, разберёмся."
