/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        midnight: '#202734', // deep_midnight_slate
        navy: '#36415A',     // muted_steel_navy
        lime: '#B7D894',     // fresh_sage_lime
        mint: '#E0F8C7',     // soft_mint_cream
        canvas: '#F9FCF6',   // light_canvas_bg
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        'soft-card': '0 4px 20px -2px rgba(32, 39, 52, 0.06)',
        'dark-card': '0 4px 20px -2px rgba(0, 0, 0, 0.35)',
        'glow-lime': '0 0 25px -4px rgba(183, 216, 148, 0.45)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
