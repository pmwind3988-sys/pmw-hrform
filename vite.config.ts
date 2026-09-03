import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Keep in sync with the index.html meta tag and the vercel.json headers. All
// three apply at once and a page is held to the *intersection*, so a directive
// left out of any one of them is enforced as `default-src 'self'` everywhere.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' data: blob: https://*.sharepoint.com https://*.microsoftonline.com https://*.microsoft.com https://graph.microsoft.com wss://*.sharepoint.com; img-src 'self' data: blob: https:; media-src 'self' blob: data: https://*.sharepoint.com https://*.sharepointonline.com; frame-src 'self' https://*.sharepoint.com https://*.officeapps.live.com https://*.office.com https://login.microsoftonline.com;"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    headers: {
      'Content-Security-Policy': CSP,
    },
    // `vercel dev` cannot serve this app on its own: it proxies the Vite dev
    // server, and on the ~6MB `@mui/icons-material` dev bundle it streams the
    // whole body and then never closes the response. The browser's module
    // fetch therefore never settles, `main.tsx` never runs, and the page stays
    // blank with no console error. Plain Vite serves the same file in 0.3s.
    //
    // So Vite serves the app and `vercel dev` is run alongside on 3001 purely
    // for `/api` — those responses are small JSON and proxy fine. Run both:
    //   npx vite --port 3000
    //   npx vercel dev --listen 3001 --yes
    // With no server on 3001 the proxy just fails the /api call, which is the
    // same behaviour as before this block existed.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // Dev-only prebundling. `@mui/icons-material` is imported an icon at a time
  // across the admin pages, so Vite's optimizer keeps discovering new icons,
  // re-bundling, and re-hashing the `createSvgIcon` chunk they all share.
  // Modules the browser already holds still point at the previous hash, that
  // request 504s as "Outdated Optimize Dep", and the module graph dies —
  // leaving an empty `#root` and a blank page on every route, not just the one
  // being loaded. Reloading does not converge, because each reload discovers
  // more icons.
  //
  // Naming it here prebundles the whole package on startup instead of letting
  // it be discovered an icon at a time, so the hashes are settled before the
  // browser asks for anything. Excluding it instead does NOT work: the icon
  // sources import `prop-types`, which is CommonJS, and unoptimized it fails
  // in the browser with "does not provide an export named 'default'".
  // Dev only — the production build goes through Rollup and is unaffected.
  optimizeDeps: {
    include: ['@mui/icons-material'],
  },
  define: {
    global: 'globalThis',
  },
})
