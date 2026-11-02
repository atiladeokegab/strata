import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', 'three'] }, // one copy each, even if a lazy chunk's dep is re-optimised mid-load
  server: { proxy: { '/api': 'http://127.0.0.1:8090' } },
})
