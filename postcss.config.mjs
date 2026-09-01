// PostCSS pipeline for Next.js: Tailwind first (expands @tailwind
// directives into utility CSS), then Autoprefixer adds vendor prefixes.
// .mjs because package.json sets "type": "module" (.js would be parsed as ESM).
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
