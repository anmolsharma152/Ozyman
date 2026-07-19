import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        shell: {
          bg: '#0c0f14',
          surface: '#141a22',
          card: '#1a222d',
          border: '#2a3544',
          muted: '#8b9bb0',
          fg: '#e8eef6',
          accent: '#6ee7b7',
          accentDim: '#34d399',
          warm: '#fbbf24',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 8px 32px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
}

export default config
