import AxeBuilder from '@axe-core/playwright'
import { Client } from 'pg'
import { afterAll, beforeAll, expect, test } from '@playwright/test'

const userId = `e2e-${crypto.randomUUID()}`
const sessionId = crypto.randomUUID()
const token = crypto.randomUUID().replace(/-/g, '')
const handle = `e2e_${token.slice(0, 12)}`
let client: Client | undefined
let signedToken = ''

async function signSessionToken(value: string): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET ?? ''
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  )
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...signature))}`)
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL
  if (!url) return
  signedToken = await signSessionToken(token)
  client = new Client({ connectionString: url })
  await client.connect()
  await client.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, now(), now())`,
    [userId, 'Utilisateur E2E', `${userId}@test.invalid`],
  )
  await client.query(
    `INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
     VALUES ($1, now() + interval '1 day', $2, now(), now(), $3)`,
    [sessionId, token, userId],
  )
  await client.query(
    `INSERT INTO "profiles" ("userId", handle, "handleNormalized", "onboardingStep", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'done', now(), now())`,
    [userId, handle, handle],
  )
})

afterAll(async () => {
  if (!client) return
  await client.query('DELETE FROM "user" WHERE id = $1', [userId])
  await client.end()
})

for (const path of ['/dashboard', '/secrets', '/vaults']) {
  test(`accessibilité authentifiée de ${path}`, async ({ context, page }) => {
    test.skip(!process.env.DATABASE_URL, 'base de test absente')
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: signedToken,
        domain: '127.0.0.1',
        path: '/',
      },
    ])
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`${path}(?:/|\\?|$)`))
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const blocking = results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id} (${violation.nodes.length})`)
    expect(blocking).toEqual([])
  })
}
