import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1d1d1f',
        graphite: '#707070',
        fog: '#f5f5f7',
        snow: '#ffffff',
        azure: '#0071e3',
        'silver-mist': '#e8e8ed',
        caution: '#b64400',
      },
      borderRadius: {
        card: '28px',
        pill: '999px',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
