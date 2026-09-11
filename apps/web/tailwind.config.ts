import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Surfaces ───
        canvas: '#fbfaf9',
        stone: '#f2f0ed',
        sand: '#f6f4ef',
        snow: '#ffffff',
        // ─── Text ───
        ink: '#121212',
        heading: '#343433',
        body: '#474645',
        muted: '#7e7e7d',
        // ─── Borders ───
        'stone-border': '#e5d5c3',
        'hairline': '#eae6e1',
        // ─── Brand / Actions ───
        azure: '#0071e3',
        'link-blue': '#0086fc',
        // ─── Semantic ───
        grass: '#00c978',
        ember: '#ff3e00',
        sun: '#ffcd6c',
        gold: '#d48f00',
        coral: '#ff58ae',
        plum: '#9f4fff',
        'alert-red': '#ff2b3a',
        // ─── Legacy compat ───
        graphite: '#7e7e7d',
        fog: '#f6f4ef',
        'silver-mist': '#eae6e1',
        caution: '#d48f00',
        // ─── ChatGPT / Investigación palette (CSS vars, swappable por perfil vía [data-profile]) ───
        'gpt-sidebar': 'rgb(var(--gpt-sidebar) / <alpha-value>)',
        'gpt-white': 'rgb(var(--gpt-white) / <alpha-value>)',
        'gpt-ink': 'rgb(var(--gpt-ink) / <alpha-value>)',
        'gpt-ash': 'rgb(var(--gpt-ash) / <alpha-value>)',
        'gpt-hollow': 'rgb(var(--gpt-hollow) / <alpha-value>)',
        'gpt-hairline': 'var(--gpt-hairline)',
        'gpt-hover': 'var(--gpt-hover)',
        'gpt-press': 'rgb(var(--gpt-press) / <alpha-value>)',
        'gpt-scrim': 'var(--gpt-scrim)',
        'gpt-edge': 'rgb(var(--gpt-edge) / <alpha-value>)',
        'gpt-accent': 'rgb(var(--gpt-accent) / <alpha-value>)',
        'gpt-on-accent': 'rgb(var(--gpt-on-accent) / <alpha-value>)',
        'gpt-mark': 'rgb(var(--gpt-mark) / <alpha-value>)',
        'gpt-mark-ink': 'rgb(var(--gpt-mark-ink) / <alpha-value>)',
      },
      borderRadius: {
        card: '12px',
        pill: '999px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        micro: ['12px', { lineHeight: '16px' }],
        caption: ['14px', { lineHeight: '20px' }],
        body: ['16px', { lineHeight: '24px' }],
        subheading: ['18px', { lineHeight: '26px' }],
        heading: ['23px', { lineHeight: '30px' }],
        'heading-lg': ['36px', { lineHeight: '42px' }],
      },
      boxShadow: {
        'inset-card': 'inset 0 0 0 1px #eae6e1',
        'soft': '0 1px 3px 0 rgba(0,0,0,0.04)',
        'elevated': '0 4px 12px -2px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
export default config;
