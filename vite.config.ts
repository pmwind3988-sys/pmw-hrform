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
  },
  define: {
    global: 'globalThis',
  },
})
