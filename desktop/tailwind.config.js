import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#0E0E10",
        window: "#0E0E10",
        sidebar: "#121214",
        main: "#161618",
        surface: "#1C1C1E",
        "surface-card": "#222224",
        "surface-hover": "#2A2A2E",
        "surface-elevated": "#2E2E32",
        border: "rgba(255,255,255,0.07)",
        "border-subtle": "rgba(255,255,255,0.04)",
        "border-hover": "rgba(255,255,255,0.11)",
        foreground: "#F2F2F3",
        card: "#222224",
        "card-foreground": "#F2F2F3",
        "muted-foreground": "#9CA3AF",
        primary: { DEFAULT: "#8B7CFF", hover: "#9B8EFF", soft: "rgba(139,124,255,0.12)", border: "rgba(139,124,255,0.25)" },
        accent: { DEFAULT: "#8B7CFF", hover: "#9B8EFF", soft: "rgba(139,124,255,0.12)" },
        text: { primary: "#F2F2F3", secondary: "#9CA3AF", muted: "#6B7280", dim: "#4B5563" },
      },
      fontFamily: { sans: ["Inter","-apple-system","BlinkMacSystemFont","sans-serif"], mono: ["JetBrains Mono","Fira Code","ui-monospace","monospace"] },
      borderRadius: { sm: "10px", md: "14px", lg: "18px", pill: "9999px" },
      boxShadow: { glow: "0 0 20px -3px rgba(139,124,255,0.16)", "glow-sm": "0 0 10px -2px rgba(139,124,255,0.12)", window: "0 16px 64px -12px rgba(0,0,0,0.85)" },
      animation: { "pulse-subtle": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite", "fade-in": "fadeIn 0.2s cubic-bezier(0.16,1,0.3,1)", "slide-up": "slideUp 0.25s cubic-bezier(0.16,1,0.3,1)", shimmer: "shimmer 1.8s ease-in-out infinite" },
      keyframes: { fadeIn: { "0%": { opacity:"0" }, "100%": { opacity:"1" } }, slideUp: { "0%": { transform:"translateY(8px)", opacity:"0" }, "100%": { transform:"translateY(0)", opacity:"1" } }, shimmer: { "0%": { backgroundPosition:"-200% 0" }, "100%": { backgroundPosition:"200% 0" } } },
    },
  },
  plugins: [typography],
};
