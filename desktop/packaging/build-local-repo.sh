#!/usr/bin/env bash
# Сборка пакета Life OS и подключение локального репозитория.
#
# Зачем это нужно: регистрация новых аккаунтов в AUR временно приостановлена, поэтому
# `yay -S lifeos` сейчас не работает. Но пакет у нас уже готовый — достаточно собрать его
# на своей машине и положить в свой репозиторий. После этого Life OS ставится и обновляется
# обычной командой `pacman -S lifeos` / `yay -S lifeos`, без всякого AUR.
#
# Когда регистрация в AUR откроется, тот же самый PKGBUILD заливается туда за три команды
# (см. aur/README.md), и всё продолжит работать как обычно.
#
# Запуск:  bash build-local-repo.sh
#
# Что делает скрипт:
#   1. ставит зависимости сборки через pacman (нужен sudo);
#   2. собирает пакет из PKGBUILD (около 400 Rust-крейтов, 10–25 минут);
#   3. кладёт .pkg.tar.zst в ~/lifeos-repo и создаёт базу репозитория;
#   4. аккуратно добавляет секцию [lifeos] в /etc/pacman.conf (с резервной копией);
#   5. ставит пакет.

set -euo pipefail

BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; OFF=$'\033[0m'
say()  { echo "${BOLD}$*${OFF}"; }
ok()   { echo "${GREEN}✓${OFF} $*"; }
warn() { echo "${YELLOW}!${OFF} $*"; }
die()  { echo "${RED}✗${OFF} $*" >&2; exit 1; }

command -v pacman >/dev/null 2>&1 || die "нужен Arch Linux (pacman не найден)"
command -v makepkg >/dev/null 2>&1 || die "makepkg не найден — поставь пакет pacman"

REPO_DIR="$HOME/lifeos-repo"
# Каталог с PKGBUILD: рядом с этим скриптом, в ../../aur относительно packaging/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKGDIR="$(cd "$SCRIPT_DIR/../../aur" 2>/dev/null && pwd)" || PKGDIR=""
[ -n "$PKGDIR" ] && [ -f "$PKGDIR/PKGBUILD" ] || die "не нашёл PKGBUILD (ожидался ../../aur/PKGBUILD)"

say "Каталог пакета: $PKGDIR"

# --- 1. зависимости ---
BUILD_DEPS=(cargo rust pkgconf patchelf)
RUN_DEPS=(webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg cairo pango glib2 base-devel)
MISSING=()
for p in "${BUILD_DEPS[@]}" "${RUN_DEPS[@]}"; do
  pacman -Qq "$p" >/dev/null 2>&1 || MISSING+=("$p")
done

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

VER_RAW=$(rustc --version | awk '{print $2}')
[ "$(printf '%s\n1.77.2\n' "$VER_RAW" | sort -V | head -1)" = "1.77.2" ] \
  || die "нужен Rust 1.77.2 или новее (сейчас $VER_RAW). Обнови: pacman -Syu rust"
ok "Rust $VER_RAW подходит"

# --- 2. сборка ---
BUILD_DIR="$(mktemp -d /tmp/lifeos-build-XXXXXX)"
trap 'rm -rf "$BUILD_DIR"' EXIT
cp "$PKGDIR/PKGBUILD" "$BUILD_DIR/"
cp "$PKGDIR/.SRCINFO" "$BUILD_DIR/" 2>/dev/null || true

say "Собираю пакет. Первый раз долго: около 400 Rust-крейтов, 10–25 минут."
cd "$BUILD_DIR"
makepkg -f --noconfirm --noprogressbar 2>&1 | tail -20
PKG=$(ls -1 ./*.pkg.tar.zst 2>/dev/null | head -1)
[ -n "$PKG" ] || die "сборка не дала пакет — смотри вывод выше"
ok "собран: $(basename "$PKG") ($(du -h "$PKG" | cut -f1))"

# --- 3. локальный репозиторий ---
mkdir -p "$REPO_DIR"
cp -f "$PKG" "$REPO_DIR/"
rm -f "$REPO_DIR"/lifeos.db* "$REPO_DIR"/lifeos.files*
if command -v repo-add >/dev/null 2>&1; then
  ( cd "$REPO_DIR" && repo-add lifeos.db.tar.gz "$(basename "$PKG")" >/dev/null )
  ok "репозиторий обновлён: $REPO_DIR/lifeos.db"
else
  # repo-add живёт в пакете pacman — без него базы не будет, ставить пакет нельзя
  die "нет repo-add (пакет pacman). Поставь: sudo pacman -S pacman"
fi

# --- 4. подключение к pacman.conf ---
CONF=/etc/pacman.conf
if grep -q '^\[lifeos\]' "$CONF"; then
  ok "секция [lifeos] в pacman.conf уже есть"
else
  [ -f "$CONF" ] || die "нет $CONF — это не Arch?"
  if [ $EUID -ne 0 ]; then
    sudo cp "$CONF" "$CONF.bak-lifeos"
    printf '\n[lifeos]\nSigLevel = Optional TrustAll\nServer = file://%s\n' "$REPO_DIR" \
      | sudo tee -a "$CONF" >/dev/null
  else
    cp "$CONF" "$CONF.bak-lifeos"
    printf '\n[lifeos]\nSigLevel = Optional TrustAll\nServer = file://%s\n' "$REPO_DIR" >> "$CONF"
  fi
  ok "секция [lifeos] добавлена (резервная копия: $CONF.bak-lifeos)"
fi

# --- 5. установка ---
say "Ставлю пакет"
if [ $EUID -ne 0 ]; then sudo pacman -S --noconfirm lifeos; else pacman -S --noconfirm lifeos; fi
ok "Life OS установлен"

echo
ok "Готово."
echo "  Запуск:            lifeos"
echo "  Удаление:           sudo pacman -R lifeos"
echo "  Обновить:           пересобери пакет и снова запусти скрипт"
echo "  Иконка и ярлык:     в меню приложений"
echo
say "Про AUR:"
echo "  Когда откроют регистрацию новых аккаунтов, залей тот же PKGBUILD:"
echo "    git clone aur@aur.archlinux.org:lifeos.git && cd lifeos"
echo "    cp /путь/к/aur/{PKGBUILD,.SRCINFO,README.md} ."
echo "    git add . && git commit -m 'lifeos 0.1.0' && git push"
echo "  После этого заработает 'yay -S lifeos' из AUR — локальный репозиторий можно убрать:"
echo "    sudo sed -i '/^\\[lifeos\\]/,+2d' /etc/pacman.conf"
