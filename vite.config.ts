import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API = 'http://localhost:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Proxy API + YouTube search to the Synapz backend (server/index.mjs).
    proxy: {
      '/api': API,
      '/yt': API,
    },
  },
})
