import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['dev/**/*int.spec.ts', 'dev/**/*int.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
