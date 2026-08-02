const { resolve } = require('path');

// Vite here does one job: run Tailwind (via PostCSS) over
// src/styles/tailwind-input.css and emit public/assets/tailwind.css,
// replacing the old `tailwindcss` CLI build/watch scripts.
module.exports = {
  publicDir: false,
  build: {
    outDir: 'public/assets',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/styles/tailwind-input.css'),
      output: {
        assetFileNames: 'tailwind.css',
      },
    },
  },
};
