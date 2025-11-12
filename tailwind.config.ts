/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        coral: 'hsl(var(--color-coral))',
        navy: 'hsl(var(--color-navy))',
        accentBlue: 'hsl(var(--color-blue))',
        surfaceGray: 'hsl(var(--color-gray))',
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 2px 8px rgba(0,0,0,0.08)',
      },
      borderRadius: {
        lg: '0.75rem',
      }
    },
  },
  plugins: [],
}