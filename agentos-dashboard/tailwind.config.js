/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0a0e1a',
        'bg-elevated': '#111827',
        'bg-card': '#171a21',
        border: '#2a2f3a',
        'border-hover': '#3a3f4a',
        text: '#e7e9ee',
        'text-muted': '#8a8f9c',
        accent: '#5865f2',
        'accent-hover': '#4752c4',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}