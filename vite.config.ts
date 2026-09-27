import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Served from https://code-ze.github.io/Teacher-Schedule-Analyzer/ on GitHub Pages
  base: '/Teacher-Schedule-Analyzer/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts']
  }
} as any)
