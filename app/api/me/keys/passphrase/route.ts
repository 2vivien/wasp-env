import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, userKeyMaterial } from '@/lib/db/schema'

const envelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  nonce: z.string().min(16).max(32),
  ct: z.string().min(32).max(131072),
}).strict()

const requestSchema = z.object({
  accountKeyPassphraseEnvelope: envelopeSchema,
  kdfParameters: z.object({
    algorithm: z.literal(2),
    opsLimit: z.number().int().min(2).max(10),
    memLimit: z.number().int().min(19 * 1024 * 1024).max(256 * 1024 * 1024),
    salt: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }).strict(),
}).strict()

export async function PUT(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(userKeyMaterial).set({
      accountKeyPassphraseEnvelope: parsed.data.accountKeyPassphraseEnvelope,
      kdfParameters: parsed.data.kdfParameters,
      rotatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(userKeyMaterial.userId, session.user.id)).returning({ userId: userKeyMaterial.userId })
    if (!row) return false
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(), actorId: session.user.id,
      event: 'passphrase_changed', targetKind: 'account_keys', targetId: session.user.id,
    })
    return true
  })
  return updated ? jsonNoStore({ updated: true }) : jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
}
