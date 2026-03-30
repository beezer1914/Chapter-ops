import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand colors (dynamically themed via CSS custom properties)
        brand: {
          primary: {
            50: "var(--color-primary-glow)",
            100: "var(--color-primary-glow)",
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
        // Dark theme surface colors
        surface: {
          deep: "var(--color-bg-deep)",
          primary: "var(--color-bg-primary)",
          card: "var(--color-bg-card)",
          "card-solid": "var(--color-bg-card-solid)",
          "card-hover": "var(--color-bg-card-hover)",
          sidebar: "var(--color-bg-sidebar)",
          DEFAULT: "var(--color-bg-surface)",
          input: "var(--color-bg-input)",
        },
        // Dark theme text colors
        content: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          heading: "var(--color-text-heading)",
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
        heading: ["var(--font-heading)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      borderColor: {
        DEFAULT: "var(--color-border)",
        brand: "var(--color-border-brand)",
        subtle: "var(--color-border-subtle)",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.2)",
        "glass-hover": "0 8px 32px 0 rgba(0, 0, 0, 0.35)",
        soft: "0 10px 40px -10px rgba(0, 0, 0, 0.15)",
        lifted:
          "0 16px 48px -12px rgba(0, 0, 0, 0.25), 0 4px 12px -2px rgba(0, 0, 0, 0.1)",
        "glow-brand": "0 0 20px -4px var(--color-primary-main)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "card-reveal":
          "cardReveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "section-reveal":
          "sectionReveal 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        cardReveal: {
          "0%": { opacity: "0", transform: "translateY(16px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        sectionReveal: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
