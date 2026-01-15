import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:8080',
      '/airports': 'http://localhost:8080',
      '/flights': 'http://localhost:8080',
      '/dispatchers': 'http://localhost:8080',
      '/transfers': 'http://localhost:8080',
      '/logs': 'http://localhost:8080',
      '/zones': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
})
