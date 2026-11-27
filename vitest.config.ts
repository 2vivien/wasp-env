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
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/crypto/**/*.ts',
        'src/modules/**/*.ts',
        'lib/permissions.ts',
        'lib/dotenv.ts',
        'lib/logger.ts',
        'lib/api.ts',
        'lib/rate-limit.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        'src/crypto/**': { lines: 95, functions: 95 },
        'lib/permissions.ts': { lines: 95 },
        'lib/dotenv.ts': { lines: 95 },
      },
    },
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://user:password@127.0.0.1:5432/wasp?sslmode=require',
      BETTER_AUTH_SECRET: 'dummy-secret-of-at-least-32-characters',
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-secret',
    },
  },
})
