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
        primary: '#3B82F6',
        secondary: '#6B7280',
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B',
        brand: {
          50: '#ecf3ff',
          100: '#dde9ff',
          300: '#9cb9ff',
          500: '#465fff',
          600: '#3641f5',
          700: '#2a31d8',
          900: '#262e89',
          950: '#161950',
        },
      },
      boxShadow: {
        'theme-xs': '0 1px 2px 0 rgba(16, 24, 40, 0.06)',
        'theme-lg':
          '0 20px 24px -4px rgba(16, 24, 40, 0.08), 0 8px 8px -4px rgba(16, 24, 40, 0.03)',
      },
    },
  },
  plugins: [],
};

export default config;
