// Список палитр для Настроек → Внешний вид.
//
// Токены каждой палитры живут в src/themes.css — здесь только то, что нужно
// показать в списке: название, подсказку и три образца цвета.
//
// `sw` — три квадратика-образца: фон, акцент, текст. Именно они видны в списке,
// поэтому подбирались так, чтобы палитры различались глазом на маленьком квадратике.

export const THEMES = [
  { id: 'glass', label: 'Стекло', hint: 'мягкие карточки и пятна света — по умолчанию',
    sw: ['#f4f5fb', '#6d5efc', '#0ea5e9'], dark: ['#0a0b16', '#8b7cff', '#38bdf8'] },
  { id: 'classic', label: 'Классика', hint: 'холодный сине-серый, как панель была до редизайна',
    sw: ['#f7f9fc', '#5865f2', '#111827'], dark: ['#0a0e1a', '#5865f2', '#e7e9ee'] },

  { id: 'tokyo-night', label: 'Tokyo Night', hint: 'сине-фиолетовая ночная',
    sw: ['#f4f5f8', '#7aa2f7', '#1b1b2b'], dark: ['#1a1b26', '#7aa2f7', '#a9b1d6'] },
  { id: 'nord', label: 'Nord', hint: 'холодный сине-серый, очень спокойный',
    sw: ['#ecf0f4', '#88c0d0', '#2e3440'], dark: ['#2e3440', '#88c0d0', '#d8dee9'] },
  { id: 'catppuccin', label: 'Catppuccin', hint: 'мягкая пастель с фиолетовым',
    sw: ['#eff1f5', '#cba6f7', '#4c4f69'], dark: ['#1e1e2e', '#cba6f7', '#cdd6f4'] },
  { id: 'gruvbox', label: 'Gruvbox', hint: 'тёплая ретро-палитра, оттенок бумаги',
    sw: ['#fbf1c7', '#fabd2f', '#3c3836'], dark: ['#282828', '#fabd2f', '#ebdbb2'] },
  { id: 'dracula', label: 'Dracula', hint: 'фиолетово-розовая, высокий контраст',
    sw: ['#f5f4fa', '#bd93f9', '#282a36'], dark: ['#282a36', '#bd93f9', '#f8f8f2'] },
  { id: 'rose-pine', label: 'Rosé Pine', hint: 'приглушённая, спокойно-долгая',
    sw: ['#faf4ed', '#c4a7e7', '#575279'], dark: ['#191724', '#c4a7e7', '#e0def4'] },
  { id: 'solarized', label: 'Solarized', hint: 'классика с 2013 года, тёплый тёмный',
    sw: ['#fdf6e3', '#268bd2', '#657b83'], dark: ['#002b36', '#268bd2', '#eee8d5'] },
  { id: 'ayu', label: 'Ayu', hint: 'тёплый тёмный с оранжевым акцентом',
    sw: ['#fafafa', '#ffb454', '#5c6166'], dark: ['#0f1419', '#ffb454', '#bfc7d5'] },
  { id: 'everforest', label: 'Everforest', hint: 'зелёная, лесная, очень тихая',
    sw: ['#faf7f0', '#a7c080', '#3c4643'], dark: ['#2d353b', '#a7c080', '#d3c6aa'] },
  { id: 'github', label: 'GitHub', hint: 'нейтральная, как у GitHub',
    sw: ['#f6f8fa', '#1f6feb', '#1f2328'], dark: ['#0d1117', '#1f6feb', '#e6edf3'] },
  { id: 'midnight', label: 'Midnight', hint: 'глубокий синий, максимальный контраст',
    sw: ['#f3f5f9', '#6ca5ff', '#181e2d'], dark: ['#0a0e1e', '#6ca5ff', '#dbe2f5'] },
]

// Omarchy не в списке: у неё нет фиксированных цветов, она приходит с компьютера.
// Живёт отдельно — см. /api/theme и lib/theme.js.
export const OMARCHY = {
  id: 'omarchy', label: 'Omarchy', hint: 'берёт цвета из темы твоей системы на ПК',
  sw: ['#1c1c1c', '#c8c093', '#f0f0f0'], dark: ['#1c1c1c', '#c8c093', '#f0f0f0'],
}

export const ALL_PALETTES = [...THEMES, OMARCHY]

export function themeById(id) {
  return ALL_PALETTES.find(t => t.id === id) || THEMES[0]
}
