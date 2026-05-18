import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        orika: {
          black: "#0A0908",
          charcoal: "#1A1814",
          graphite: "#2A2520",
          ink: "#3A342E",
          cream: "#F0EAE0",
          cloud: "#C8C2B8",
          smoke: "#6A6560",
          stone: "#9E9891",
          gold: "#C9A86C",
          "gold-dim": "#8A6A30",
          "gold-glow": "#D9BC87",
        },
        living: {
          sage: "#8B9D77",
          "sage-dim": "#6F7E5E",
          "sage-glow": "#A8B894",
        },
        bejewelled: {
          rose: "#B76E79",
          "rose-dim": "#955862",
          "rose-glow": "#D08E97",
        },
        surface: {
          primary: "#0A0908",
          secondary: "#1A1814",
          tertiary: "#2A2520",
          elevated: "#3A342E",
          // Light surfaces for modals/forms (luxury cream — never #FFF)
          light: "#F0EAE0",
          "light-soft": "#E6DFD3",
          "light-deep": "#D9D0C2",
        },
        text: {
          primary: "#F0EAE0",
          muted: "#6A6560",
          accent: "#C9A86C",
          // Light-surface text
          "on-light": "#0A0908",
          "on-light-muted": "#6A6560",
        },
        state: {
          success: "#8B9D77",
          warn: "#D9A741",
          danger: "#C75B5B",
          info: "#7A8FA8",
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "serif"],
        body: ["Montserrat", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgba(201,168,108,0.15)",
        "glow-md": "0 0 20px rgba(201,168,108,0.25)",
        "glow-lg": "0 0 40px rgba(201,168,108,0.20)",
        card: "0 4px 6px -1px rgba(0,0,0,0.5), 0 2px 4px -1px rgba(0,0,0,0.3)",
        "card-lg":
          "0 12px 24px -8px rgba(0,0,0,0.6), 0 4px 8px -2px rgba(0,0,0,0.4)",
        modal:
          "0 20px 25px -5px rgba(0,0,0,0.8), 0 10px 10px -5px rgba(0,0,0,0.6)",
        lift: "0 8px 24px rgba(0,0,0,0.4)",
        "rose-glow": "0 0 24px rgba(183,110,121,0.18)",
        "sage-glow": "0 0 24px rgba(139,157,119,0.18)",
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
        "slide-up": "slide-up 0.5s cubic-bezier(0.16,1,0.3,1)",
        "slide-down": "slide-down 0.4s cubic-bezier(0.16,1,0.3,1)",
        "scale-in": "scale-in 0.35s cubic-bezier(0.16,1,0.3,1)",
        shimmer: "shimmer 2.5s ease-in-out infinite",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: { "0%,100%": { opacity: "0.4" }, "50%": { opacity: "1" } },
      },
    },
  },
  plugins: [],
};

export default config;
