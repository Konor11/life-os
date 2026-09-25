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

Одна команда ставит всё и поднимает systemd-сервис:

```bash
sudo bash deploy/install.sh
```

Что делает `install.sh`: npm install (backend + dashboard) → production build
(`NODE_OPTIONS="--max-old-space-size=4096"`, OOM-фикс) → генерация
`agent-definitions.json` из `src/config/agents` → пишет и включает **один**
юнит `lifeos.service` → health check (:3004 + :3002) → **опционально спрашивает
базовый домен и генерирует Caddyfile для `os.<domain>` + инфраструктурных
поддоменов `admin.<domain>`, `hermes.<domain>`, `workspace.<domain>`**.
Поддомены движков (`oc.*`, `ds.*`, `n8n.*`) **не создаются здесь** — они
добавляются автоматически при установке соответствующих компонентов через
UI («Установка компонентов»).

Если скрипт запущен интерактивно — спросит домен (с дефолтом из предыдущего
Caddyfile). Неинтерактивно (CI) — читает `LIFEOS_DOMAIN` из env или берёт
предыдущий. Без домена — просто пишет `deploy/Caddyfile` с инструкцией
настроить Caddy вручную.

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