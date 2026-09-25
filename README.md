# Life OS — Agent OS

Self-hosted web dashboard («оркестратор + специализированные агенты») c интеративным
Hermes Desktop: терминал, файлы, чат и встроенные web-интерфейсы AI-движков
(Hermes, OpenCode, Codex, Claude, Pi, DeepSeek, OpenClaw, Web).

Публичный адрес: `https://os.dktunnel.xyz`

## Компоненты

| Каталог | Роль | Стек |
|---|---|---|
| `agentos-dashboard/` | Веб-дашборд (React + Vite + Tailwind) | JS/React, слушает `:3002` |
| `agentos-backend/` | Оркестратор/API (Express + WS) | Node, слушает `:3004` |
| `deploy/` | Конфиги деплоя (Caddy, системные старт-скрипты) | — |

## Запуск

Одна команда ставит всё с нуля (исходники скачаются сами):

```bash
curl -fsSL https://raw.githubusercontent.com/Konor11/life-os/main/deploy/bootstrap.sh | bash
```

Bootstrap сам ставит git (если нет), клонирует/обновляет репозиторий в
`/root/life-os` (путь переопределяется: `LIFEOS_DIR=/srv/life-os`) и запускает
`deploy/install.sh`.

Что делает `install.sh`: ставит недостающее (curl, Node.js 20 через NodeSource,
Caddy через официальный репозиторий) → npm install (backend + dashboard) →
production build (`NODE_OPTIONS="--max-old-space-size=4096"`, OOM-фикс) →
генерация `agent-definitions.json` из `src/config/agents` → пишет и включает
**один** юнит `lifeos.service` → health check (:3004 + :3002) → **опционально
спрашивает базовый домен и генерирует Caddyfile только для `os.<domain>`
(Life OS)**. Остальные поддомены (admin, hermes, workspace, движки)
настраиваются отдельно.

Повторный запуск идемпотентен: обновляет клон, пересобирает, перезапускает
`lifeos.service`. Неинтерактивно (CI) домен читается из `LIFEOS_DOMAIN`.

Ручной запуск (для отладки):

```bash
# backend
cd agentos-backend && npm install
# требуются ключи в /root/.hermes/.env (OPENROUTER_API_KEY и т.п.)
./start_backend.sh

# dashboard
cd agentos-dashboard && npm install
NODE_OPTIONS="--max-old-space-size=4096" npm run build   # нужен повышенный heap (OOM-фикс)
```

## systemd

Один юнит на весь стек — **`lifeos.service`** (backend `:3004` + dashboard `:3002`
под супервизором `deploy/lifeos-stack.sh`):

```bash
systemctl status lifeos        # статус
systemctl restart lifeos       # применить правки кода (обязательно после билда)
journalctl -u lifeos -f        # логи
```

Если один из процессов умирает — супервизор гасит второй, и systemd перезапускает
стек целиком (`Restart=always`). Отдельных юнитов `agentos-backend` /
`agentos-dashboard` больше нет; install.sh гасит их остатки при переустановке.

## Ingress-архитектура (см. `deploy/Caddyfile`)

Один публичный домен `os.dktunnel.xyz`, приватные поддомены для отдельных web-движков,
чтобы их SPA работали на корне (v2-клиенты отказываются работать под префиксом пути):

| Поддомен | Backend | Защита |
|---|---|---|
| `oc.dktunnel.xyz` | OpenCode (`:4096`) | Referer-фильтр: только из Life OS |
| `ds.dktunnel.xyz` | DeepSeek/dsh (`:3090`) | Referer + `--trusted-host ds.dktunnel.xyz` |

Private subdomains отдают `403` при прямом заходе извне — доступ только через iframe Life OS.

## Известные особенности / фиксы

- **Vite build OOM**: `npm run build` без `NODE_OPTIONS="--max-old-space-size=4096"` крашится
  на SSR-transform (Vite/Rollup heap limit). 4096 стабильно, 3072 недостаточно.
- **opencode v2 + префикс пути**: SPA роутит строго по `pathname.split("/")`; под
  префиксом всегда падает в `{type:"home"}` (пустой экран). Решение — приватный поддомен
  `oc.dktunnel.xyz` + localStorage-seed `opencode.global.dat:layout.page`.
- **dsh (DeepSeek)**: JS шлёт корневые пути `/plugins/*`, `/api/*`; под префиксом уходят
  на оркестратор -> 403. Свой приватный поддомен `ds.dktunnel.xyz` + `--trusted-host`.
  Авторизация через cookie: iframe сам грузит `ds.dktunnel.xyz/?token=...` (SameSite кука
  на домене ds), потом 303 -> `/`.
- **dsh токен при рестарте**: dsh перевыпускает токен при каждом старте. Backend всегда
  перечитывает последний токен из лога, а не кэширует (иначе 401).

## Легальная оговорка

Проект развивается как «догфуд» для личного usage. Управление в секции Desktop —
визуальное воспроизведение «Agent OS» (по мотивам обзоров Julian Goldie SEO).