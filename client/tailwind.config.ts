import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // ── DESIGN TOKENS ──────────────────────────────────────
      // Every colour reads a CSS variable holding an "R G B"
      // triplet. Defaults live in styles/index.css (:root); the
      // ThemeProvider overwrites them at runtime from
      // GET /api/branding (shared.platform_settings), so the
      // whole app is re-themeable per deployment with no rebuild.
      //
      // Semantics of the neutral scale (dark default theme):
      //   black     app background          cream  primary text
      //   charcoal  card surface            cloud  secondary text
      //   graphite  borders / elevated      smoke  muted text
      //   ink       elevated-2              stone  faint text
      //   accent    THE brand accent (+dim/glow variants)
      //   accent2/3 supporting accents (decorative, themeable)
      //   biz       the ACTIVE business's accent (layer-2 branding,
      //             swapped on business switch from business_config)
      colors: {
        brand: {
          black: "rgb(var(--brand-black) / <alpha-value>)",
          charcoal: "rgb(var(--brand-charcoal) / <alpha-value>)",
          graphite: "rgb(var(--brand-graphite) / <alpha-value>)",
          ink: "rgb(var(--brand-ink) / <alpha-value>)",
          cream: "rgb(var(--brand-cream) / <alpha-value>)",
          cloud: "rgb(var(--brand-cloud) / <alpha-value>)",
          smoke: "rgb(var(--brand-smoke) / <alpha-value>)",
          stone: "rgb(var(--brand-stone) / <alpha-value>)",
          accent: "rgb(var(--brand-accent) / <alpha-value>)",
          "accent-dim": "rgb(var(--brand-accent-dim) / <alpha-value>)",
          "accent-glow": "rgb(var(--brand-accent-glow) / <alpha-value>)",
        },
        accent2: {
          DEFAULT: "rgb(var(--accent2) / <alpha-value>)",
          dim: "rgb(var(--accent2-dim) / <alpha-value>)",
          glow: "rgb(var(--accent2-glow) / <alpha-value>)",
        },
        accent3: {
          DEFAULT: "rgb(var(--accent3) / <alpha-value>)",
          dim: "rgb(var(--accent3-dim) / <alpha-value>)",
          glow: "rgb(var(--accent3-glow) / <alpha-value>)",
        },
        biz: {
          accent: "rgb(var(--biz-accent) / <alpha-value>)",
          "accent-dim": "rgb(var(--biz-accent-dim) / <alpha-value>)",
          "accent-glow": "rgb(var(--biz-accent-glow) / <alpha-value>)",
        },
        surface: {
          primary: "rgb(var(--brand-black) / <alpha-value>)",
          secondary: "rgb(var(--brand-charcoal) / <alpha-value>)",
          tertiary: "rgb(var(--brand-graphite) / <alpha-value>)",
          elevated: "rgb(var(--brand-ink) / <alpha-value>)",
          // Light surfaces for modals/forms (luxury cream — never #FFF)
          light: "rgb(var(--surface-light) / <alpha-value>)",
          "light-soft": "rgb(var(--surface-light-soft) / <alpha-value>)",
          "light-deep": "rgb(var(--surface-light-deep) / <alpha-value>)",
        },
        text: {
          primary: "rgb(var(--brand-cream) / <alpha-value>)",
          muted: "rgb(var(--brand-smoke) / <alpha-value>)",
          accent: "rgb(var(--brand-accent) / <alpha-value>)",
          // Light-surface text
          "on-light": "rgb(var(--brand-black) / <alpha-value>)",
          "on-light-muted": "rgb(var(--brand-smoke) / <alpha-value>)",
        },
        state: {
          success: "rgb(var(--state-success) / <alpha-value>)",
          warn: "rgb(var(--state-warn) / <alpha-value>)",
          danger: "rgb(var(--state-danger) / <alpha-value>)",
          info: "rgb(var(--state-info) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgb(var(--brand-accent) / 0.15)",
        "glow-md": "0 0 20px rgb(var(--brand-accent) / 0.25)",
        "glow-lg": "0 0 40px rgb(var(--brand-accent) / 0.20)",
        card: "0 4px 6px -1px rgba(0,0,0,0.5), 0 2px 4px -1px rgba(0,0,0,0.3)",
        "card-lg":
          "0 12px 24px -8px rgba(0,0,0,0.6), 0 4px 8px -2px rgba(0,0,0,0.4)",
        modal:
          "0 20px 25px -5px rgba(0,0,0,0.8), 0 10px 10px -5px rgba(0,0,0,0.6)",
        lift: "0 8px 24px rgba(0,0,0,0.4)",
        "accent3-glow": "0 0 24px rgb(var(--accent3) / 0.18)",
        "accent2-glow": "0 0 24px rgb(var(--accent2) / 0.18)",
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
