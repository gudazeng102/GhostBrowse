import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  // 前端源码根目录
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
