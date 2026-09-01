import type { Config } from "tailwindcss";

// Tailwind scans these paths for class names; anything outside them stays
// unstyled, so keep new pages under app/ and components/.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // School brand palette (matches the header navy used across pages).
        brand: {
          navy: "#1B2A4A",
          gold: "#C9A227",
        },
      },
    },
  },
  plugins: [],
};
export default config;
