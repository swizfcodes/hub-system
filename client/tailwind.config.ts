import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        orika: {
          black: '#0A0908',
          charcoal: '#1A1814',
          graphite: '#2A2520',
          cream: '#F0EAE0',
          cloud: '#C8C2B8',
          smoke: '#6A6560',
          gold: '#C9A86C',
        },
        living: {
          sage: '#8B9D77',
        },
        bejewelled: {
          rose: '#B76E79',
        },
        surface: {
          primary: '#0A0908',
          secondary: '#1A1814',
          tertiary: '#2A2520',
        },
        text: {
          primary: '#F0EAE0',
          muted: '#6A6560',
          accent: '#C9A86C',
        }
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'serif'],
        body: ['Montserrat', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(201, 168, 108, 0.15)',
        'glow-md': '0 0 20px rgba(201, 168, 108, 0.25)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.8), 0 10px 10px -5px rgba(0, 0, 0, 0.6)',
      }
    },
  },
  plugins: [],
};

export default config;