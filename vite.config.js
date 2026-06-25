import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    proxy: {
      '/api/groq': {
        target: 'https://api.groq.com/openai/v1/chat/completions',
        changeOrigin: true,
        rewrite: () => '',
        secure: true
      }
    }
  }
})
