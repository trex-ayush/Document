/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        neutral: {
          50: '#FAFAF9',
          100: '#F5F5F4',
          200: '#E7E5E4',
          300: '#D6D3D1',
          400: '#A8A29E',
          500: '#78716C',
          600: '#57534E',
          700: '#44403C',
          800: '#292524',
          900: '#1C1917',
          // Page background in dark mode (AppShell, auth, public share). Without it Tailwind's
          // own cool-grey neutral-950 was used, which didn't match the warm scale above.
          950: '#0C0A09',
        },
        primary: {
          50: '#FFF1F0',
          100: '#FFE4E1',
          200: '#FFC9C2',
          300: '#FFA194',
          400: '#FF7A65',
          500: '#FF5A5F',
          600: '#E04E52',
          700: '#C14245',
          800: '#A03638',
          900: '#7F2A2B',
        },
        accent: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'soft-xs': '0 1px 2px 0 rgba(0,0,0,0.03)',
        'soft-sm': '0 2px 4px 0 rgba(0,0,0,0.04), 0 1px 2px 0 rgba(0,0,0,0.02)',
        soft: '0 4px 12px 0 rgba(0,0,0,0.05), 0 2px 4px 0 rgba(0,0,0,0.03)',
        'soft-md': '0 8px 24px 0 rgba(0,0,0,0.08), 0 4px 8px 0 rgba(0,0,0,0.04)',
        'soft-lg': '0 16px 48px 0 rgba(0,0,0,0.12), 0 8px 16px 0 rgba(0,0,0,0.06)',
        card: '0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px 0 rgba(0,0,0,0.02)',
        'card-hover': '0 8px 28px 0 rgba(0,0,0,0.12), 0 4px 12px 0 rgba(0,0,0,0.08)',
        dropdown: '0 4px 20px 0 rgba(0,0,0,0.15)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'tooltip-pop': 'tooltipPop 0.1s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        tooltipPop: { '0%': { opacity: '0', transform: 'scale(0.92)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
};
