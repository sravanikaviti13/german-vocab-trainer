import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,           // listen on all interfaces
    allowedHosts: true,   // accept requests from any hostname (incl. cloudflare tunnels)
  },
})