import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:  ['react', 'react-dom'],
          socket:  ['socket.io-client'],
          crypto:  ['crypto-js'],
        }
      }
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    hmr: true,
  }
})