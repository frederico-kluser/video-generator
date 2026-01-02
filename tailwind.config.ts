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
      animation: {
        float: 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
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
