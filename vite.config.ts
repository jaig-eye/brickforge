import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// @tailwindcss/vite is ESM-only; dynamic import works in CJS context
export default defineConfig(async () => {
  const { default: tailwindcss } = await import('@tailwindcss/vite')
  return {
    plugins: [react(), tailwindcss()],
    root: '.',
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: { main: path.resolve(__dirname, 'index.html') },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
