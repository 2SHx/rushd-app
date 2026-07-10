import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          paper: "var(--surface-paper)",
          card: "var(--surface-card)",
          raised: "var(--surface-raised)",
        },
        accent: "var(--accent)",
        up: "var(--up)",
        down: "var(--down)",
        noncompliant: "var(--noncompliant)",
        emerald: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
        arabic: ['var(--font-arabic)', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
export default config;
