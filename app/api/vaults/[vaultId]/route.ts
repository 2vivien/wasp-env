import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { jsonNoStore, hasValidMutationHeaders } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, vaults } from '@/lib/db/schema'

const envelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  nonce: z.string().min(16).max(32),
  ct: z.string().min(32).max(128),
}).strict()

const updateVaultSchema = z.object({
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

type RouteContext = { params: Promise<{ vaultId: string }> }

const encMetaSchema = z.object({
  v: z.literal(1), alg: z.literal('A256GCM'),
  nonce: z.string().min(16).max(32), ct: z.string().min(32).max(12000),
}).strict()

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { vaultId } = await params
  if (!z.string().uuid().safeParse(vaultId).success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = z.object({ encMeta: encMetaSchema }).strict().safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [updated] = await db.update(vaults).set({ encMeta: parsed.data.encMeta, updatedAt: new Date() })
    .where(and(eq(vaults.id, vaultId), eq(vaults.userId, session.user.id)))
    .returning({ id: vaults.id })
  if (!updated) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(), actorId: session.user.id, vaultId,
    event: 'vault_updated', targetKind: 'vault', targetId: vaultId,
  })
  return jsonNoStore({ updated: true })
}

export async function PUT(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  const { vaultId } = await params
  if (!z.string().uuid().safeParse(vaultId).success) {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const parsed = updateVaultSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const updated = await db.update(vaults).set({
    keySalt: parsed.data.keySalt,
    wrappedKey: parsed.data.wrappedKey,
    kdfParameters: parsed.data.kdfParameters,
    updatedAt: new Date(),
  }).where(and(eq(vaults.id, vaultId), eq(vaults.userId, session.user.id))).returning({ id: vaults.id })

  if (updated.length === 0) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  return jsonNoStore({ id: updated[0]?.id })
}
