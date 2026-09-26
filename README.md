# Life OS

Self-hosted панель для своего сервера: один веб-интерфейс, из которого ставятся и
запускаются AI-движки (Hermes, OpenCode, Codex, Claude, Pi, DeepSeek, OpenClaw, …) и
сервисы (n8n, Coder) — с терминалом, файлами, чатом и встроенными web-интерфейсами
движков прямо в браузере.

## Быстрый старт

Одна команда на чистом сервере (исходники скачаются сами):

```bash
curl -fsSL https://raw.githubusercontent.com/Konor11/life-os/main/deploy/bootstrap.sh | bash
```

Bootstrap ставит git (если нет), клонирует/обновляет репозиторий в `/root/life-os`
(путь переопределяется: `LIFEOS_DIR=/srv/life-os`) и запускает `deploy/install.sh`.
Для неинтерактивной установки домен передаётся заранее:
`LIFEOS_DOMAIN=lifeos.example.com curl -fsSL ... | bash`.

Установщик спросит **один** домен — адрес самой панели Life OS. Домены движков и
компонентов запрашиваются позже, при их установке из панели.

## Что делает install.sh

1. Ставит недостающее: `curl`, Node.js 20 (NodeSource), Caddy (официальный репозиторий).
2. `npm install` для backend и dashboard.
3. Production-сборка дашборда: `NODE_OPTIONS="--max-old-space-size=4096" npm run build`
   (без повышенного heap сборка падает по OOM — 3072 недостаточно).
4. Генерирует `agent-definitions.json` из `agentos-dashboard/src/config/agents/`.
5. Пишет и включает **один** юнит `lifeos.service` (backend `:3004` + dashboard `:3002`).
6. Health check обоих портов.
7. Генерирует `deploy/Caddyfile` и, если Caddy найден, устанавливает его как конфиг —
   **только для сайта Life OS**. Файл генерируется заново при каждом запуске
   (поэтому он в `.gitignore`), править его руками бессмысленно.

Повторный запуск идемпотентен: обновляет клон, пересобирает, перезапускает
`lifeos.service`.

## Каталоги и порты

| Каталог | Роль | Порт |
|---|---|---|
| `agentos-dashboard/` | Веб-дашборд (React + Vite + Tailwind) | `:3002` |
| `agentos-backend/` | API + WS, установка движков, PTY-терминал | `:3004` |
| `deploy/` | `bootstrap.sh`, `install.sh`, супервизор `lifeos-stack.sh` | — |

Порты устанавливаемых сервисов: Hermes dashboard `:9119`, OpenCode `:4096`, n8n `:5678`,
Coder `:7080`.

## Установка движков и компонентов из панели

Раздел **«Установка компонентов»** показывает карточку на каждый движок и сервис:
статус, кнопки «Установить / Обновить / Удалить», лог и панель управления мастером.

**Домен задаётся при установке.** Никаких поддоменов по умолчанию в коде нет: движок с
web-интерфейсом просит домен в модалке (поле пустое, пример — только подсказкой), и
установщик:

- пишет домен в `/root/.<id>-domain` (например `/root/.hermes-domain`);
- добавляет сайт в Caddy (`reverse_proxy 127.0.0.1:<порт>`);
- отдаёт его панели через `/api/harnesses` и `/api/components` — вкладка **Web** в чате и
  разделы n8n/Coder встраивают интерфейс именно по этому адресу.

Компоненты без модалки (n8n, Coder) выводят домен сами: записанный `/root/.<id>-domain`,
иначе `<id>.<родительский домен Life OS>` (для панели `lifeos.example.com` это
`n8n.example.com`), и сразу публикуют свой сайт в Caddy.

**Интерактивные мастера** (Hermes ставится официальным
`curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`) идут в настоящем
PTY: под логом появляются кнопки `↑ ↓ ← → ⏎ Пробел y n Esc`, поле для ввода строки (ключ,
ответ) и читаемый «экран» вместо сырых ANSI-последовательностей. Выбранная строка
подсвечивается (мастер помечает выбор стрелкой `→`, а `(●)` — просто значок
«рекомендованный вариант», он не двигается). **Esc отменяет мастер** — если мастер закрыт,
вернуться в него можно кнопкой **«⚙ Мастер настроек»** на карточке установленного движка.

**Hermes:** выбор режима (только TUI / только Web UI / оба), домен для Web UI и защита
(Basic Auth / OAuth Nous Portal / оба). Логин и пароль Basic Auth задаются в модалке
(пустое поле — сгенерируется), сохраняются в `/root/.hermes-web-auth` и в env-файле
`/root/.hermes/dashboard_auth_env.conf`, читаемом сервисом `hermes-dashboard.service`.
Для OAuth клиент регистрируется с публичным callback:
`hermes dashboard register --redirect-uri https://<домен>/auth/callback` — без этого
портал отказывает с `redirect_uri_mismatch`.

**OpenCode:** режим TUI/Web/оба + домен. Своя защита у него не спрашивается — доступ
ограничивается доменом и Caddy.

## Домены и Caddy

- Caddy определяется автоматически: нативный (`/etc/caddy/Caddyfile` + `systemctl reload
  caddy`) или docker-контейнер (`/root/remnawave-admin/Caddyfile` + `docker restart caddy`).
- `install.sh` пишет в шапку конфига базовый домен; панель читает его оттуда, чтобы
  выводить домены компонентов.
- Удаление движка/сервиса убирает и его сайт из Caddy, и записанный домен.

## systemd

Один юнит на весь стек — `lifeos.service` (backend + dashboard под супервизором
`deploy/lifeos-stack.sh`):

```bash
systemctl status lifeos      # статус
systemctl restart lifeos     # применить правки кода (после билда — обязательно)
journalctl -u lifeos -f      # логи
```

Устанавливаемые движки живут отдельными юнитами (`hermes-gateway` — user-юнит,
`hermes-dashboard`, `opencode-web`, `n8n`, `coder`) и панель их не перезапускает.

## Особенности и грабли

- **Vite build OOM**: `NODE_OPTIONS="--max-old-space-size=4096"` — 3072 мало.
- **Детект «установлено»** — по наличию юнит-файла, который пишет наш собственный
  установщик (`test -f /etc/systemd/system/<id>.service`). `systemctl is-active | grep -q
  active` ложно матчит `inactive`, а `command -v` ловит остатки бинарника.
- **`hermes gateway install`** пишет **user**-сервис: ему нужны
  `XDG_RUNTIME_DIR=/run/user/0`, `DBUS_SESSION_BUS_ADDRESS` и `loginctl enable-linger`,
  иначе шаг падает с «Failed to connect to user scope bus».
- **Пересборка дашборда подхватывается без перезапуска** (статика отдаётся с диска), но
  перезапуск нужен, если менялся backend — и он же убивает запущенные PTY-установки.
- **opencode v2** роутит по корню домена, поэтому ему нужен отдельный домен, а не префикс
  пути. **dsh** перевыпускает токен при каждом старте — backend перечитывает его из лога,
  а не кэширует.

## Разработка

```bash
cd agentos-dashboard && npm install
NODE_OPTIONS="--max-old-space-size=4096" npm run build

cd ../agentos-backend && npm install && ./start_backend.sh
```

Ключи провайдеров — во вкладке «Ключи» панели (пишутся в `/root/.hermes/.env` и env-файлы
движков).

## Легальная оговорка

Проект развивается как «догфуд» для личного usage.
