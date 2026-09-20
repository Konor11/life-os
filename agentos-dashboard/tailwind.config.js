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
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)',
        'card-lg': '0 4px 12px rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
}