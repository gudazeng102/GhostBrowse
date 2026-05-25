import { defineConfig } from 'vitest/config'
import * as path from 'path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/shared/**/*.test.ts', 'src/shared/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/shared/**/*.ts'],
      exclude: ['src/shared/**/*.test.ts', 'src/shared/**/index.ts']
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  }
})