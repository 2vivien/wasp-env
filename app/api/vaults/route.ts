import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { jsonNoStore, hasValidMutationHeaders } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { profiles, user, vaults } from '@/lib/db/schema'

const envelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  nonce: z.string().min(16).max(32),
  ct: z.string().min(32).max(128),
}).strict()

const createVaultSchema = z.object({
  id: z.string().uuid(),
  keySalt: z.string().min(20).max(32),
  wrappedKey: z.object({
    v: z.literal(1),
    passphrase: envelopeSchema,
    recovery: envelopeSchema,
  }).strict(),
  kdfParameters: z.object({
    algorithm: z.literal(2),
    opsLimit: z.number().int().min(2).max(10),
    memLimit: z.number().int().min(19 * 1024 * 1024).max(256 * 1024 * 1024),
  }).strict(),
}).strict()

export async function GET(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)

  const includeKeys = new URL(request.url).searchParams.get('includeKeys') === '1'
  const rows = await db.select({
    id: vaults.id,
    keySalt: vaults.keySalt,
    ...(includeKeys ? { wrappedKey: vaults.wrappedKey } : {}),
    kdfParameters: vaults.kdfParameters,
    createdAt: vaults.createdAt,
    updatedAt: vaults.updatedAt,
  }).from(vaults).where(eq(vaults.userId, session.user.id)).orderBy(vaults.updatedAt)
  return jsonNoStore({ vaults: rows })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const parsed = createVaultSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const result = await db.transaction(async (transaction) => {
    const owner = await transaction.select({ id: user.id }).from(user)
      .where(eq(user.id, session.user.id)).for('update').limit(1)
    if (owner.length === 0) return 'OWNER_NOT_FOUND'

    const [profile] = await transaction.select({ handle: profiles.handle }).from(profiles)
      .where(eq(profiles.userId, session.user.id)).for('update').limit(1)
    if (!profile?.handle) return 'PROFILE_REQUIRED'

    const existing = await transaction.select({ id: vaults.id }).from(vaults)
      .where(eq(vaults.userId, session.user.id)).limit(1)
    if (existing.length > 0) return 'VAULT_EXISTS'

    await transaction.insert(vaults).values({
      id: parsed.data.id,
      userId: session.user.id,
      keySalt: parsed.data.keySalt,
      wrappedKey: parsed.data.wrappedKey,
      kdfParameters: parsed.data.kdfParameters,
    })
    await transaction.update(profiles).set({ onboardingStep: 'done', updatedAt: new Date() })
      .where(eq(profiles.userId, session.user.id))
    return 'CREATED'
  })

  if (result !== 'CREATED') {
    const status = result === 'PROFILE_REQUIRED' ? 409 : result === 'OWNER_NOT_FOUND' ? 404 : 409
    return jsonNoStore({ error: { code: result } }, status)
  }
  return jsonNoStore({ id: parsed.data.id }, 201)
}
