import type { Config } from "tailwindcss";

/**
 * Tailwind preset exposing DxM tokens as utility classes.
 * The tokens are CSS variables defined in `tokens.css`, so changing
 * them at runtime (e.g. theme switch) updates all downstream classes.
 */
const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        ink: "var(--dxm-ink)",
        "ink-soft": "var(--dxm-ink-soft)",
        "ink-raised": "var(--dxm-ink-raised)",
        graphite: "var(--dxm-graphite)",
        "graphite-2": "var(--dxm-graphite-2)",
        fog: "var(--dxm-fog)",
        "fog-2": "var(--dxm-fog-2)",
        mist: "var(--dxm-mist)",
        paper: "var(--dxm-paper)",
        orange: {
          DEFAULT: "var(--dxm-orange)",
          soft: "var(--dxm-orange-soft)",
        },
        amber: {
          DEFAULT: "var(--dxm-amber)",
          soft: "var(--dxm-amber-soft)",
        },
        blue: {
          DEFAULT: "var(--dxm-blue)",
          deep: "var(--dxm-blue-deep)",
        },
        ok: "var(--dxm-ok)",
        warn: "var(--dxm-warn)",
        risk: "var(--dxm-risk)",
      },
      borderRadius: {
        DEFAULT: "var(--dxm-r)",
        sm: "var(--dxm-r-sm)",
        lg: "var(--dxm-r-lg)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
};

export default preset;
