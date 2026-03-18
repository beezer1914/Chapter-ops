import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand colors (dynamically themed via CSS custom properties)
        brand: {
          primary: {
            50: "var(--color-primary-light)",
            100: "var(--color-primary-light)",
            200: "var(--color-primary-light)",
            light: "var(--color-primary-light)",
            main: "var(--color-primary-main)",
            DEFAULT: "var(--color-primary-main)",
            dark: "var(--color-primary-dark)",
            950: "var(--color-primary-dark)",
          },
          secondary: {
            light: "var(--color-secondary-light)",
            main: "var(--color-secondary-main)",
            DEFAULT: "var(--color-secondary-main)",
            dark: "var(--color-secondary-dark)",
          },
          accent: {
            light: "var(--color-accent-light)",
            main: "var(--color-accent-main)",
            DEFAULT: "var(--color-accent-main)",
            dark: "var(--color-accent-dark)",
          },
        },
        // Keep existing primary for backward compatibility
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
        'glass-hover': '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
        'soft': '0 10px 40px -10px rgba(0,0,0,0.05)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
} satisfies Config;
