/** Paleta restrita: branco, cinzas e um único acento (verde) para "atingido". */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#FFFFFF',
      black: '#000000',
      gray: {
        50: '#F5F5F5',
        100: '#E5E5E5',
        400: '#9CA3AF',
        700: '#374151',
        800: '#1F2937',
        900: '#111827',
        950: '#0B0F17',
      },
      // único acento: verde para "preço atingido" (AA em fundo branco e escuro)
      accent: { DEFAULT: '#15803D', soft: '#F0FDF4', dark: '#4ADE80', darksoft: '#0F2A1A' },
    },
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: { subtle: '0 1px 2px rgba(17,24,39,.04), 0 1px 3px rgba(17,24,39,.06)' },
      borderRadius: { DEFAULT: '8px' },
    },
  },
  plugins: [],
};
