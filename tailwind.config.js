/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Easy Gold blue brand palette
        brand: {
          50: '#eef4ff',
          100: '#dce7fd',
          200: '#c0d4fb',
          300: '#94b8f8',
          400: '#6292f3',
          500: '#3e6fee',
          600: '#2851e2',
          700: '#1f3fd0',
          800: '#1e36a9',
          900: '#1d3285',
          950: '#162051',
        },
        accent: {
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
        surface: '#f4f7fc',
      },
      fontFamily: {
        sans: ['"Google Sans"', 'Inter', 'Roboto', 'system-ui', 'sans-serif'],
        display: ['"Google Sans"', 'Inter', 'Roboto', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
        'card-hover': '0 4px 12px rgba(16, 24, 40, 0.08)',
        pop: '0 12px 32px rgba(16, 24, 40, 0.18)',
        glow: '0 6px 18px rgba(37, 99, 235, 0.35)',
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
