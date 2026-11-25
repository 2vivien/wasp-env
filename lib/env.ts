import 'server-only'
import { z } from 'zod'

const serverEnvironment = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url().optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  V0_RUNTIME_URL: z.string().url().optional(),
  V0_DEV_APP_URL: z.string().url().optional(),
  V0_BUILD_URL: z.string().url().optional(),
  V0_SANDBOX_URL: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const env = serverEnvironment.parse(process.env)
