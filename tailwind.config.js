/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand (Indigo)
        primary: {
          50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 300: '#A5B4FC',
          400: '#818CF8', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA',
          800: '#3730A3', 900: '#312E81',
        },
        neutral: {
          0: '#FFFFFF', 50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0',
          300: '#CBD5E1', 400: '#94A3B8', 500: '#64748B', 600: '#475569',
          700: '#334155', 800: '#1E293B', 900: '#0F172A',
        },
        success: {
          50: '#ECFDF5', 400: '#34D399', 500: '#10B981', 600: '#059669', 700: '#047857',
        },
        warning: {
          50: '#FFFBEB', 400: '#FBBF24', 500: '#F59E0B', 600: '#D97706', 700: '#B45309',
        },
        danger: {
          50: '#FEF2F2', 400: '#F87171', 500: '#EF4444', 600: '#DC2626', 700: '#B91C1C',
        },
        // NOTE: the old CSS-var semantic surface utilities (bg/surface/line/ink/...)
        // were removed — the validated mock stylesheet (src/index.css) is now the
        // sole design system. Raw palettes below remain for incidental utilities.
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        'display-amount': ['2.5rem', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }],
        'amount-lg': ['1.75rem', { lineHeight: '1.15', fontWeight: '700', letterSpacing: '-0.01em' }],
        'amount-md': ['1.0625rem', { lineHeight: '1.3', fontWeight: '600' }],
      },
      borderRadius: {
        sm: '6px', md: '12px', lg: '16px', xl: '24px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15,23,42,.06)',
        md: '0 4px 12px rgba(15,23,42,.08)',
        lg: '0 10px 24px rgba(15,23,42,.12)',
        fab: '0 8px 20px rgba(79,70,229,.35)',
        toast: '0 8px 16px rgba(15,23,42,.16)',
      },
      maxWidth: {
        phone: '448px',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,0,0,1)',
        emphasized: 'cubic-bezier(.3,0,0,1)',
      },
    },
  },
  plugins: [],
};
