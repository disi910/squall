import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Serve from a subpath when hosted under one (GitHub Pages: BASE_PATH=/squall/).
  // The router and the data loader both read this through import.meta.env.BASE_URL.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    // MDX compiles to JSX first, then the React plugin handles it like any component file.
    { enforce: 'pre', ...mdx() },
    react({ include: /\.(mdx|jsx|tsx|js|ts)$/ }),
    tailwindcss(),
  ],
})
