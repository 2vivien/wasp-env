import 'server-only'
import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import { env } from '@/lib/env'

const PREVIEW_ORIGIN = 'https://gestionnaire-de-secrets-wasp-aaa6bba38c7b9638.v0.build'
const previewOrigins = [...new Set([
  PREVIEW_ORIGIN,
  env.V0_RUNTIME_URL,
  env.V0_DEV_APP_URL,
  env.V0_BUILD_URL,
  env.V0_SANDBOX_URL,
].filter((origin): origin is string => Boolean(origin)))]

const productionOrigins = [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter((origin): origin is string => Boolean(origin))
  .map((origin) => `https://${origin}`)

export const auth = betterAuth({
  appName: 'Wasp',
  database: pool,
  baseURL:
    env.BETTER_AUTH_URL ??
    (env.NODE_ENV === 'development'
      ? env.V0_RUNTIME_URL ?? PREVIEW_ORIGIN
      : env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
        : env.VERCEL_URL
          ? `https://${env.VERCEL_URL}`
          : env.V0_RUNTIME_URL ?? PREVIEW_ORIGIN),
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scope: ['openid', 'email', 'profile'],
      disableDefaultScope: true,
      prompt: 'select_account',
    },
  },
  trustedOrigins: [
    ...(env.NODE_ENV === 'development' ? ['http://localhost:3000', ...previewOrigins] : []),
    ...(env.NODE_ENV === 'production' ? productionOrigins : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
  },
  databaseHooks: {
    account: {
      create: {
        before: async (account) => ({
          data: {
            ...account,
            accessToken: null,
            refreshToken: null,
            idToken: null,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
          },
        }),
      },
      update: {
        before: async (account) => ({
          data: {
            ...account,
            accessToken: null,
            refreshToken: null,
            idToken: null,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
          },
        }),
      },
    },
  },
  ...(env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})
