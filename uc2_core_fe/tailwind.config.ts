import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    "./public/index.html",
    "./public/index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
