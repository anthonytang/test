/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // Include all @studio packages for Tailwind CSS classes
    "../packages/*/src/**/*.{js,ts,jsx,tsx}",
    "../packages/*/dist/**/*.{js,mjs}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0d2a4f',
          50: '#e6ebf2',
          100: '#ccd7e5',
          200: '#99afcb',
          300: '#6687b0',
          400: '#335f96',
          500: '#0d2a4f',
          600: '#0a2240',
          700: '#081930',
          800: '#051120',
          900: '#030810',
        },
        secondary: {
          DEFAULT: '#8e4ca8',
          50: '#f5ebf8',
          100: '#ebd7f1',
          200: '#d7afe3',
          300: '#c387d5',
          400: '#af5fc7',
          500: '#8e4ca8',
          600: '#723d86',
          700: '#552e65',
          800: '#391f43',
          900: '#1c0f22',
        },
        accent: {
          DEFAULT: '#5170ff',
          50: '#e8ecff',
          100: '#d1d9ff',
          200: '#a3b3ff',
          300: '#758dff',
          400: '#5170ff',
          500: '#5170ff',
          600: '#4159cc',
          700: '#314399',
          800: '#202c66',
          900: '#101633',
        },
      },
      fontFamily: {
        'sans': ['Lato', 'system-ui', 'sans-serif'],
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite linear',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'fade-out': 'fadeOut 0.5s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-out': 'slideOut 0.3s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideOut: {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-10px)', opacity: '0' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
} 