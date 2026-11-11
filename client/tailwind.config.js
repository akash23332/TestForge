/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tf: {
          canvas: '#F2F3F0',
          sidebar: '#191A1D',
          card: '#E9ECE7',
          'card-secondary': '#E4E8E2',
          lime: '#EDFF72',
          'lime-hover': '#E2F560',
          charcoal: '#171819',
          muted: '#777D78',
          border: '#DDE1DA',
          frame: '#9BA497',
          surface: '#FFFFFF',
          'chart-muted': '#C9CEC7',
        },
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'bento': '0 2px 12px -2px rgba(25, 26, 29, 0.04), 0 1px 3px rgba(25, 26, 29, 0.02)',
        'bento-hover': '0 12px 28px -6px rgba(25, 26, 29, 0.08), 0 4px 10px -2px rgba(25, 26, 29, 0.04)',
        'bento-lime': '0 8px 24px -4px rgba(237, 255, 114, 0.35)',
      }
    },
  },
  plugins: [],
}
