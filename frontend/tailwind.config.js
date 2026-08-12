import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'page-title': ['34px', { lineHeight: '1.2', fontWeight: '700' }],
        'section-title': ['20px', { lineHeight: '1.3', fontWeight: '700' }],
        'card-title': ['18px', { lineHeight: '1.3', fontWeight: '500' }],
        'body': ['15px', { lineHeight: '1.5', fontWeight: '400' }],
        'secondary': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['13px', { lineHeight: '1.4', fontWeight: '400' }],
      },
      colors: {
        primary: {
          DEFAULT: '#7C72E8',
          50:  '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C72E8',
          700: '#6D63D9',
          800: '#5B4FC4',
          900: '#4C3FAF',
          950: '#2E2A6E',
          light: '#F0EEFF',
          hover: '#6D63D9',
        },
        lavender: {
          DEFAULT: '#7C72E8',
          50: '#F5F3FF',
          100: '#F0EEFF',
          200: '#E4E1FA',
          soft: '#EBE8FF',
        },
        online: {
          DEFAULT: '#A7BED3',
          bg: '#EEF5FF',
          light: '#F4F8FC',
        },
        offline: {
          DEFAULT: '#A8C7A1',
          bg: '#F2FBF4',
          light: '#F6FAF6',
        },
        overdue: {
          DEFAULT: '#E8C66A',
          bg: '#FFF8E8',
          text: '#6E5A18',
        },
        received: {
          DEFAULT: '#A8C7A1',
          bg: '#F3FAF5',
          text: '#3F5F49',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          subtle: '#FAFBFC',
          card: '#FFFFFF',
        },
        content: {
          primary: '#2F2F2F',
          secondary: '#64748B',
          muted: '#94A3B8',
        },
        success: {
          bg: '#F3FAF5',
          text: '#3F5F49',
          DEFAULT: '#A8C7A1',
        },
        warning: {
          bg: '#FFF8E8',
          text: '#6E5A18',
          DEFAULT: '#E8C66A',
        },
        error: {
          bg: '#FEF2F2',
          text: '#B91C1C',
          DEFAULT: '#EF4444',
        },
        info: {
          bg: '#EEF5FF',
          text: '#1E5F8A',
          DEFAULT: '#A7BED3',
        },
        border: {
          DEFAULT: 'rgba(47, 47, 47, 0.06)',
          light: '#F1F5F9',
        },
        nav: {
          bg: '#FFFFFF',
          activeBg: '#7C72E8',
          activeText: '#FFFFFF',
          idleText: '#64748B',
          idleIcon: '#94A3B8',
          hoverBg: '#F8FAFC',
        },
        slate: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
      },
      spacing: {
        '4.5': '18px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '18': '72px',
        'navbar-content': '40px',
        'module-gap': '48px',
        'heading-card': '16px',
        'card-gap': '14px',
        'column-gap': '32px',
        'card-padding': '22px',
      },
      borderRadius: {
        'card': '20px',
        'btn': '16px',
        'input': '12px',
        'badge': '999px',
        'modal': '24px',
        'nav': '16px',
        'sidebar-item': '16px',
      },
      boxShadow: {
        'sm': '0 2px 8px rgba(47, 47, 47, 0.03)',
        'md': '0 8px 24px rgba(47, 47, 47, 0.04)',
        'lg': '0 16px 48px rgba(47, 47, 47, 0.06)',
        'card': '0 4px 20px rgba(47, 47, 47, 0.04)',
        'card-hover': '0 8px 32px rgba(47, 47, 47, 0.06)',
        'btn': '0 2px 4px rgba(124, 114, 232, 0.12)',
        'btn-hover': '0 4px 12px rgba(124, 114, 232, 0.20)',
        'sidebar-active': '0 4px 14px rgba(124, 114, 232, 0.18)',
        'soft': '0 2px 12px rgba(47, 47, 47, 0.03)',
      },
      transitionDuration: {
        '150': '150ms',
        '180': '180ms',
      },
      scale: {
        '102': '1.02',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 150ms ease-out',
        'scale-in': 'scaleIn 200ms ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      width: {
        'sidebar': '220px',
        'sidebar-collapsed': '72px',
      },
      margin: {
        'sidebar': '220px',
      },
      height: {
        'header': '72px',
        'nav-item': '44px',
      },
    },
  },
  plugins: [typography],
}
