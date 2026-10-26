import type { Config } from 'tailwindcss';

// Brand palette and type from the Coffee Science website, trimmed to what the teaser uses.
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FBF7F2',
          100: '#F5EDE3',
        },
        forest: {
          500: '#2D5138',
          950: '#040F09',
        },
        gold: {
          200: '#F0DDB0',
          300: '#E2C88D',
          400: '#D4AF6A',
          500: '#C9A04E',
        },
        ink: '#050604',
      },
      fontFamily: {
        serif: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.9s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
