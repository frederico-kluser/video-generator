import type { Config } from 'tailwindcss';

const withOpacityValue = (variable: string) => {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue === undefined) {
      return `rgb(var(${variable}) / 1)`;
    }

    return `rgb(var(${variable}) / ${opacityValue})`;
  };
};

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          950: withOpacityValue('--color-dark-950'),
          900: withOpacityValue('--color-dark-900'),
          850: withOpacityValue('--color-dark-850'),
          800: withOpacityValue('--color-dark-800'),
          700: withOpacityValue('--color-dark-700'),
          600: withOpacityValue('--color-dark-600'),
          500: withOpacityValue('--color-dark-500'),
        },
        primary: {
          50: withOpacityValue('--color-primary-50'),
          100: withOpacityValue('--color-primary-100'),
          200: withOpacityValue('--color-primary-200'),
          300: withOpacityValue('--color-primary-300'),
          400: withOpacityValue('--color-primary-400'),
          500: withOpacityValue('--color-primary-500'),
          600: withOpacityValue('--color-primary-600'),
          700: withOpacityValue('--color-primary-700'),
          800: withOpacityValue('--color-primary-800'),
          900: withOpacityValue('--color-primary-900'),
        },
        accent: {
          50: withOpacityValue('--color-accent-50'),
          100: withOpacityValue('--color-accent-100'),
          200: withOpacityValue('--color-accent-200'),
          300: withOpacityValue('--color-accent-300'),
          400: withOpacityValue('--color-accent-400'),
          500: withOpacityValue('--color-accent-500'),
          600: withOpacityValue('--color-accent-600'),
          700: withOpacityValue('--color-accent-700'),
          800: withOpacityValue('--color-accent-800'),
          900: withOpacityValue('--color-accent-900'),
        },
        success: {
          400: withOpacityValue('--color-success-400'),
          500: withOpacityValue('--color-success-500'),
          600: withOpacityValue('--color-success-600'),
        },
        danger: {
          400: withOpacityValue('--color-danger-400'),
          500: withOpacityValue('--color-danger-500'),
          600: withOpacityValue('--color-danger-600'),
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow':
          'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(120, 119, 198, 0.3), transparent)',
        'card-glow':
          'radial-gradient(ellipse at center, rgba(139, 92, 246, 0.15), transparent 70%)',
      },
      boxShadow: {
        'glow-sm': '0 0 15px -3px rgba(139, 92, 246, 0.3)',
        glow: '0 0 30px -5px rgba(139, 92, 246, 0.4)',
        'glow-lg': '0 0 50px -10px rgba(139, 92, 246, 0.5)',
        'glow-accent': '0 0 30px -5px rgba(6, 182, 212, 0.4)',
        'inner-glow': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s linear infinite',
        gradient: 'gradient 8s ease infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.5s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
