import '@fontsource-variable/ibm-plex-sans'
import '@fontsource-variable/space-grotesk'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from './routes.tsx'

// basename follows Vite's base, so the site also works from a subpath (e.g. GitHub Pages).
const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
