import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/shared/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        app: 'rgb(var(--bg-app) / <alpha-value>)',
        sidebar: 'rgb(var(--bg-sidebar) / <alpha-value>)',
        card: 'rgb(var(--bg-card) / <alpha-value>)',
        surface: 'rgb(var(--bg-surface) / <alpha-value>)',
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          hover: 'rgb(var(--border-hover) / <alpha-value>)',
        },
        primary: 'rgb(var(--text-primary) / <alpha-value>)',
        secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        hover: 'rgb(var(--hover) / <alpha-value>)',
        active: 'rgb(var(--active) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        error: 'rgb(var(--error) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--bg-app) / <alpha-value>)',
          light: 'rgb(var(--bg-card) / <alpha-value>)',
          lighter: 'rgb(var(--bg-card) / <alpha-value>)',
          line: 'rgb(var(--border) / <alpha-value>)',
          blue: 'rgb(var(--accent) / <alpha-value>)',
          'blue-hover': 'rgb(var(--accent-hover) / <alpha-value>)',
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
        'theme-xs': '0 1px 2px 0 rgb(0 0 0 / 0.35)',
        'theme-lg': '0 24px 64px -12px rgb(0 0 0 / 0.65)',
      },
    },
  },
  plugins: [],
};

export default config;
