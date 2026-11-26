import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
      'server-only': fileURLToPath(new URL('./tests/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    env: {
      DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/wasp?sslmode=require',
      BETTER_AUTH_SECRET: 'dummy-secret-of-at-least-32-characters',
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-secret',
    },
  },
})
