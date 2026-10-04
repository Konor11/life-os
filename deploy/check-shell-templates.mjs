#!/usr/bin/env node
// Проверка шаблонных строк с shell-скриптами (install/uninstall компонентов и харнессов).
//
// Проблема, ради которой скрипт существует: install/uninstall — это ШАБЛОННАЯ СТРАНКА JS.
// Каждая `${ПЕРЕМЕННАЯ}` в ней интерполируется JavaScript ДО запуска bash:
//   - если переменная объявлена в JS (NODE22_DIR, OMNIROUTE_HOME, componentDomainPrelude) — это
//     намеренная подстановка, всё в порядке;
//   - если это переменная BASH — её надо писать как `\${ПЕРЕМЕННАЯ}`, иначе ReferenceError;
//   - хуже всего: `${...}` в КОММЕНТАРИИ. Комментарий — часть литерала, JS всё равно
//     подставляет, и backend падает при старте. Это стоило четырёх падений подряд.
//
// `node --check` такую ошибку НЕ находит: синтаксис валиден, ошибка возникает в runtime.
// Поэтому проверяем сами: вычисляем литерал тем же способом, что и Node, и ловим ReferenceError.
//
// Запуск: node deploy/check-shell-templates.mjs

import fs from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverPath = path.join(here, '..', 'agentos-backend', 'server.js')
const src = fs.readFileSync(serverPath, 'utf8')

// Переменные, объявленные в самом server.js. Всё остальное `${...}` — ошибка.
const jsConsts = new Set([
  'NODE22_DIR', 'OMNIROUTE_HOME', 'NODE22_MAJOR_MIN', 'LIFEOS_DIR',
  'N8N_SERVICE', 'CODER_SERVICE',   // шаблоны systemd-юнитов, объявлены в server.js
  '$',                               // идиома ${'$'} — подставляет в скрипт одинарный доллар
])

// Известные вызовы-подстановки вида ${что-то(...)} — это JS, а не переменная bash.
const callPattern = /^[A-Za-z_$][\w$]*\(.*\)$/

// Обратная кавычка в комментарии внутри install/uninstall закрывает template-литерал и
// делает ФАЙЛ синтаксически невалидным. Свой сканер тут бессилен: чтобы увидеть такой
// литерал, его надо сначала разобрать, а он не разбирается. Ответ даёт сам Node —
// тот же приём сработал бы и на любой другой поломке синтаксиса.
const syntax = spawnSync(process.execPath, ['--check', serverPath], { encoding: 'utf8' })
if (syntax.status !== 0) {
  console.error('\nОШИБКА СИНТАКСИСА server.js — backend не запустится:')
  console.error(syntax.stderr.split('\n').filter(Boolean).slice(0, 5).map(l => '  ' + l).join('\n'))
  console.error('\nЧастая причина: неэкранированная обратная кавычка в комментарии внутри')
  console.error('install/uninstall — она закрывает литерал.')
  process.exit(1)
}

let checked = 0
let broken = 0

// Вырезаем каждый литерал install:/uninstall: и проверяем его ОТДЕЛЬНО.
// Значения переменных JS подставляем заглушками — важно только, чтобы интерполяция не падала.
function checkLiteral(label, body) {
  checked++
  // bash-переменные экранированы: \${VAR} -> JS отдаёт ${VAR}, bash разворачивает.
  // Неэкранированные ${VAR} попробуем вычислить — здесь и ловится ReferenceError.
  const candidates = body.match(/(?<!\\)\$\{([A-Za-z_$][\w$]*)\}/g) || []
  const unescaped = body.match(/(?<!\\)\$\{([^}]*)\}/g) || []
  for (const raw of unescaped) {
    let inner = raw.slice(2, -1).trim()
    if (callPattern.test(inner)) continue           // ${componentDomainPrelude(...)} — это JS-вызов
    if (/^['"].*['"]$/.test(inner)) continue      // ${'$'} — идиома подстановки одинарного доллара
    if (jsConsts.has(inner)) continue                // ${NODE22_DIR} — это наша JS-константа
    broken++
    const line = body.slice(0, body.indexOf(raw)).split('\n').length
    console.error(`  ОШИБКА [${label}] неэкранированная подстановка \${${inner}} (строка ~${line})`)
    console.error(`    → это переменная bash или комментарий; backend упадёт с ReferenceError`)
  }
  void candidates
}

// Разбираем сервер примерно так же, как это сделал бы парсер: ищем `install: \`` … `,`
// Упрощённо: берём блоки между ключами и следующей строкой с тем же отступом.
const literalRe = /(install|uninstall|setup):\s*`([\s\S]*?)`,\n/g
let m
while ((m = literalRe.exec(src)) !== null) {
  checkLiteral(m[1], m[2])
}

if (broken) {
  console.error(`\nПровалено подстановок: ${broken} из ${checked} литералов.`)
  console.error('Экранируй переменные bash как \\${ПЕРЕМЕННАЯ}; не пиши ${...} и обратные кавычки в комментариях.')
  process.exit(1)
}
console.log(`Ок: ${checked} shell-литералов, неэкранированных подстановок нет.`)
