import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // The theme's accent colour (Studio → Theme), usable with opacity: bg-accent/10, border-accent/40…
        accent: "rgb(var(--spot-accent-rgb, 46 232 247) / <alpha-value>)",
        // mAI Spot brand palette (from brand/palette/palette.json)
        spot: {
          bg: "#030608",
          steel: "#080f12",
          panel: "#0d161a",
          panelLight: "#121e24",
          borderGlow: "#1a323c",
          borderDim: "#14262e",
          orange: "#f9993c",
          magenta: "#ff2e6e",
          cyan: "#2ee8f7",
          blue: "#00f0ff",
          pink: "#ff3385",
          gold: "#ffcf33",
          green: "#39ff88",
          red: "#ff3c3c",
          textPrimary: "#a1efff",
          textBright: "#e6fdff",
          textMuted: "#649fae"
        },
        // PulseAmp Audio Player colors
        pulseamp: {
          dark: "#080f12",
          darker: "#030608",
          panel: "#0d161a",
          border: "#1a323c",
          green: "#39ff88",
          cyan: "#2ee8f7",
          gold: "#ffcf33",
          lcd: "#061309",
          ledText: "#39ff88"
        },
        // ChromaVision Cinema colors
        chromavision: {
          orange: "#f9993c",
          magenta: "#ff2e6e",
          slate: "#0d161a",
          darkSlate: "#080f12",
          chrome: "#121e24",
          border: "#1a323c"
        },
        // Backward-compatible aliases for existing classes
        winamp: {
          dark: "#080f12",
          darker: "#030608",
          panel: "#0d161a",
          border: "#1a323c",
          title: "#121e24",
          green: "#39ff88",
          amber: "#ffcf33",
          red: "#ff3c3c",
          lcd: "#061309",
          ledText: "#39ff88"
        },
        vlc: {
          orange: "#f9993c",
          darkOrange: "#ff8e2b",
          slate: "#0d161a",
          darkSlate: "#080f12",
          chrome: "#121e24",
          border: "#1a323c"
        }
      },
      fontFamily: {
        mono: ["JetBrains Mono Variable", "Consolas", "Courier New", "monospace"],
        sans: ["Space Grotesk Variable", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      }
    },
  },
  plugins: [],
};
export default config;
