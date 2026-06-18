import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        app: 'var(--bg-app)',
        sidebar: 'var(--bg-sidebar)',
        card: 'var(--bg-card)',
        border: 'var(--border)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        hover: 'var(--hover)',
        active: 'var(--active)',
        success: '#22c55e',
        error: '#ef4444',
        warning: '#eab308',
        idle: '#71717a',
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
