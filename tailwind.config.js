/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Easy Gold blue brand palette — anchored on #0c53ac (brand-600)
        brand: {
          50: '#eef5fd',
          100: '#d9e9fa',
          200: '#bcd8f5',
          300: '#8dc0ee',
          400: '#57a0e3',
          500: '#2f80d4',
          600: '#0c53ac',
          700: '#0b4690',
          800: '#0d3c77',
          900: '#0f3463',
          950: '#0a2140',
        },
        // Analogous sky accent (color-wheel related to the brand blue)
        accent: {
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        // Complementary gold accent — the "Easy Gold" brand touch
        gold: {
          50: '#fdf8ec',
          100: '#f9ecca',
          200: '#f2d68f',
          300: '#ecc05c',
          400: '#e5a83a',
          500: '#d98e26',
          600: '#b96f1d',
          700: '#96551c',
        },
        surface: '#f4f7fc',
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans Lao"', 'system-ui', 'sans-serif'],
        display: ['Inter', '"Noto Sans Lao"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Deliberately soft — the UI leans on borders + color, not heavy shadows
        card: '0 1px 2px rgba(16, 24, 40, 0.04)',
        'card-hover': '0 2px 8px rgba(16, 24, 40, 0.07)',
        pop: '0 8px 24px rgba(16, 24, 40, 0.12)',
        glow: '0 2px 6px rgba(12, 83, 172, 0.22)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(16px)' }, to: { opacity: '1', transform: 'none' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
        'scale-in': 'scale-in 0.18s ease-out',
      },
    },
  },
  plugins: [],
};
