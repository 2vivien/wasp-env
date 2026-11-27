import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, userKeyMaterial } from '@/lib/db/schema'

const envelopeSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal('A256GCM'),
    nonce: z.string().min(16).max(32),
    ct: z.string().min(32).max(131072),
  })
  .strict()

const keyMaterialSchema = z
  .object({
    publicKeyX25519: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    publicKeyEd25519: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    encryptedPrivateKeys: envelopeSchema,
    accountKeyPassphraseEnvelope: envelopeSchema,
    accountKeyRecoveryEnvelope: envelopeSchema,
    kdfParameters: z
      .object({
        algorithm: z.literal(2),
        opsLimit: z.number().int().min(2).max(10),
        memLimit: z
          .number()
          .int()
          .min(19 * 1024 * 1024)
          .max(256 * 1024 * 1024),
        salt: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
      })
      .strict(),
  })
  .strict()

export async function GET(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const includeEncrypted = new URL(request.url).searchParams.get('includeEncrypted') === '1'
  if (includeEncrypted) {
    const [material] = await db
      .select({
        publicKeyX25519: userKeyMaterial.publicKeyX25519,
        publicKeyEd25519: userKeyMaterial.publicKeyEd25519,
        encryptedPrivateKeys: userKeyMaterial.encryptedPrivateKeys,
        accountKeyPassphraseEnvelope: userKeyMaterial.accountKeyPassphraseEnvelope,
        accountKeyRecoveryEnvelope: userKeyMaterial.accountKeyRecoveryEnvelope,
        kdfParameters: userKeyMaterial.kdfParameters,
        formatVersion: userKeyMaterial.formatVersion,
      })
      .from(userKeyMaterial)
      .where(eq(userKeyMaterial.userId, session.user.id))
      .limit(1)
    return material ? jsonNoStore(material) : jsonNoStore({ configured: false })
  }
  const [material] = await db
    .select({
      publicKeyX25519: userKeyMaterial.publicKeyX25519,
      publicKeyEd25519: userKeyMaterial.publicKeyEd25519,
      formatVersion: userKeyMaterial.formatVersion,
    })
    .from(userKeyMaterial)
    .where(eq(userKeyMaterial.userId, session.user.id))
    .limit(1)
  return material ? jsonNoStore(material) : jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true))
    return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }
  const parsed = keyMaterialSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(userKeyMaterial)
      .values({
        userId: session.user.id,
        ...parsed.data,
      })
      .onConflictDoNothing()
      .returning({ userId: userKeyMaterial.userId })
    if (rows.length) {
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        event: 'key_material_created',
        targetKind: 'account_keys',
      })
    }
    return rows
  })

  if (!inserted.length) return jsonNoStore({ error: { code: 'ALREADY_EXISTS' } }, 409)
  return jsonNoStore({ saved: true }, 201)
}
