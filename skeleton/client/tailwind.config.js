/** @type {import('tailwindcss').Config} */
const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground') },
        success: { DEFAULT: token('success'), foreground: token('success-foreground') },
        warning: { DEFAULT: token('warning'), foreground: token('warning-foreground') },
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        sidebar: { DEFAULT: token('sidebar'), foreground: token('sidebar-foreground') },
        chart: { 1: token('chart-1'), 2: token('chart-2'), 3: token('chart-3'), 4: token('chart-4'), 5: token('chart-5') },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      keyframes: {
        bob: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 0 0 hsl(var(--primary) / 0.55)' }, '50%': { boxShadow: '0 0 0 18px hsl(var(--primary) / 0)' } },
        swirl: { to: { transform: 'rotate(360deg)' } },
        fadeUp: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        bob: 'bob 3.2s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 1.6s ease-out infinite',
        swirl: 'swirl 1.4s linear infinite',
        'fade-up': 'fadeUp .25s ease-out both',
      },
    },
  },
  plugins: [],
};
