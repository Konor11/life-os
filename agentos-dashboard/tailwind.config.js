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
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        card: 'var(--cx-shadow-card)',
        'card-lg': '0 2px 6px rgb(20 26 46 / .06), 0 24px 56px -16px rgb(20 26 46 / .22)',
        'card-xl': '0 4px 10px rgb(20 26 46 / .07), 0 36px 80px -20px rgb(20 26 46 / .26)',
      },
      // Масштаб радиусов: «Стекло» держится на крупных скруглениях. Меняем шкалу целиком —
      // все существующие rounded-* в панели становятся нужного размера без правки компонентов.
      borderRadius: {
        none: '0px',
        sm: '8px',
        DEFAULT: '11px',
        md: '12px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
        '3xl': '28px',
        full: '9999px',
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}