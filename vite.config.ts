import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

/**
 * The banner text depends on the dataset the site is built with, so read its
 * manifest at build time (see src/content/banner.ts). Tests always use the
 * simulated wording, whatever data happens to be in public/data.
 */
function dataInfo(): {
  source: 'simulated' | 'harness'
  agentCount: number
  featured: string | null
} {
  const path = 'public/data/manifest.json'
  if (process.env.VITEST || !existsSync(path))
    return { source: 'simulated', agentCount: 0, featured: null }
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  return {
    source: manifest.source,
    agentCount: manifest.agents.length,
    featured: manifest.featuredRunIds?.[0] ?? null,
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Serve from a subpath when hosted under one (GitHub Pages: BASE_PATH=/squall/).
  // The router and the data loader both read this through import.meta.env.BASE_URL.
  base: process.env.BASE_PATH ?? '/',
  define: { __SQUALL_DATA__: JSON.stringify(dataInfo()) },
  plugins: [
    // MDX compiles to JSX first, then the React plugin handles it like any component file.
    { enforce: 'pre', ...mdx() },
    react({ include: /\.(mdx|jsx|tsx|js|ts)$/ }),
    tailwindcss(),
  ],
})
