import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/shared/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        app: 'var(--bg-app)',
        sidebar: 'var(--bg-sidebar)',
        card: 'var(--bg-card)',
        surface: 'var(--bg-surface)',
        border: {
          DEFAULT: 'var(--border)',
          hover: 'var(--border-hover)',
        },
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        hover: 'var(--hover)',
        active: 'var(--active)',
        accent: {
          DEFAULT: '#2563EB',
          hover: '#1d4ed8',
          foreground: '#ffffff',
        },
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',
        idle: '#71717a',
        brand: {
          DEFAULT: '#0a0a0a',
          light: '#121212',
          lighter: '#1a1a1a',
          line: 'rgba(255,255,255,0.08)',
          blue: '#2563EB',
          'blue-hover': '#1d4ed8',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'Consolas',
          'monospace',
        ],
      },
      borderRadius: {
        '2xl': '12px',
        '3xl': '14px',
      },
      boxShadow: {
        'theme-xs': '0 1px 2px 0 rgba(0,0,0,0.3)',
        'theme-lg': '0 20px 24px -4px rgba(0,0,0,0.4), 0 8px 8px -4px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
