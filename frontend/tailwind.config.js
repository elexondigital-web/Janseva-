/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#087EA4',
          dark: '#05649B',
          light: '#149ECA',
          bg: '#e8f4f8',
        },
        navy: {
          DEFAULT: '#23272F',
          light: '#343A46',
        },
        surface: {
          DEFAULT: '#f6f7f9',
          subtle: '#eef0f3',
        },
        border: {
          DEFAULT: '#dde1e7',
        },
        text: {
          primary: '#23272F',
          secondary: '#5E6773',
          muted: '#99A1AD',
        },
        status: {
          green: '#2D9A68',
          'green-bg': '#ecf8f2',
          amber: '#C07B1A',
          'amber-bg': '#fef6e7',
          red: '#C0392B',
          'red-bg': '#fdecea',
        },
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        mono: ['"Source Code Pro"', 'monospace'],
      },
      fontSize: {
        xs: ['12px', '1.5'],
        sm: ['13px', '1.5'],
        base: ['14px', '1.5'],
        lg: ['16px', '1.5'],
        xl: ['18px', '1.4'],
        '2xl': ['22px', '1.3'],
        '3xl': ['28px', '1.2'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        elevated: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '5px',
      },
    },
  },
  plugins: [],
};
