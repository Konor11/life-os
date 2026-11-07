/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--cx-bg) / <alpha-value>)',
        'bg-elevated': 'rgb(var(--cx-bg-elevated) / <alpha-value>)',
        'bg-card': 'rgb(var(--cx-bg-card) / <alpha-value>)',
        border: 'rgb(var(--cx-border) / <alpha-value>)',
        'border-hover': 'rgb(var(--cx-border-hover) / <alpha-value>)',
        text: 'rgb(var(--cx-text) / <alpha-value>)',
        'text-muted': 'rgb(var(--cx-text-muted) / <alpha-value>)',
        'text-faint': 'rgb(var(--cx-text-faint) / <alpha-value>)',
        'accent-2': 'rgb(var(--cx-accent-2) / <alpha-value>)',
        accent: 'rgb(var(--cx-accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--cx-accent-hover) / <alpha-value>)',
        success: 'rgb(var(--cx-success) / <alpha-value>)',
        warning: 'rgb(var(--cx-warning) / <alpha-value>)',
        danger: 'rgb(var(--cx-danger) / <alpha-value>)',
      },
      fontFamily: {
        // SF Pro Display/Text на устройствах Apple; на Linux/Android — Inter,
        // максимально близкий метрически (тот же x-height, те же пропорции цифр).
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text',
               'Inter', 'system-ui', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['SF Mono', 'ui-monospace', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      // Типографическая шкала apple.com: hero-заголовки 48–80, разделы 40, текст 17.
      /* Шкала apple.com (спецификация): hero 56/600/1.07/-0.28px; section 40/600/1.10;
         body 17/400/1.47/-0.374px; caption 14/-0.224px. Weight 700 запрещён — max 600. */
      fontSize: {
        'hero': ['clamp(1.75rem, 5vw, 3.5rem)', { lineHeight: '1.07', letterSpacing: '-0.01em', fontWeight: '600' }],
        'display': ['clamp(1.5rem, 3.5vw, 2.5rem)', { lineHeight: '1.10', fontWeight: '600' }],
        'section': ['2.5rem', { lineHeight: '1.10', fontWeight: '600' }],
        'lead': ['1.3125rem', { lineHeight: '1.19', fontWeight: '400' }],
        'body-lg': ['1.0625rem', { lineHeight: '1.47', letterSpacing: '-0.374px' }],
        'body': ['0.9375rem', { lineHeight: '1.47', letterSpacing: '-0.244px' }],
        'caption': ['0.75rem', { lineHeight: '1.33', letterSpacing: '-0.12px' }],
      },
      boxShadow: {
        card: 'var(--cx-shadow-card)',
        'card-lg': '0 2px 6px rgb(20 26 46 / .06), 0 24px 56px -16px rgb(20 26 46 / .22)',
        'card-xl': '0 4px 10px rgb(20 26 46 / .07), 0 36px 80px -20px rgb(20 26 46 / .26)',
      },
      // Масштаб радиусов: «Стекло» держится на крупных скруглениях. Меняем шкалу целиком —
      // все существующие rounded-* в панели становятся нужного размера без правки компонентов.
      /* Радиусы по спецификации Apple: 8px — кнопки/карточки; 11px — поиск;
         12px — крупные панели; больше 12px на прямоугольных НЕЛЬЗЯ (980 — только пилюли). */
      borderRadius: {
        none: '0px',
        sm: '5px',
        DEFAULT: '8px',
        md: '8px',
        lg: '11px',
        xl: '12px',
        '2xl': '12px',
        '3xl': '12px',
        full: '980px',  // пилюля «Подробнее» — фирменный радиус apple.com
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}