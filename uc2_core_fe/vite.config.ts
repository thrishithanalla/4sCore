import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'mainFe': path.resolve(__dirname, './src/lib/mainFe'),
    },
  },
  server: {
    port: 3002,
    open: true,
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
