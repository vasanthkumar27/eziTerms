import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // Accept any preview host (e.g. *.preview.emergentagent.com) and the
    // Kubernetes ingress domain. Vite blocks unknown hosts by default in v5+.
    allowedHosts: true,
    // In local dev (your laptop), proxy /api to the backend on :8000.
    // In the Emergent preview, the ingress routes /api/* to port 8001 directly,
    // so this proxy is only used for `yarn dev` on a developer machine.
    proxy: {
      '/api': 'http://localhost:8000',
    },
    hmr: {
      clientPort: 443,
    },
  },
})
