import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, keyRotationJobs, privateShareLinks, scopedShares, vaultItems, vaults } from '@/lib/db/schema'

const blobSchema = z.object({ v: z.literal(1), alg: z.literal('A256GCM'), nonce: z.string().min(16).max(32), ct: z.string().min(16).max(100_000) }).strict()
const itemSchema = z.object({
  version: z.number().int().min(2), scopeKeyVersion: z.number().int().min(2), scopeKeyEnvelope: blobSchema,
  metadata: blobSchema, value: blobSchema,
  history: z.array(z.object({ version: z.number().int().min(1), metadata: blobSchema, value: blobSchema, createdAt: z.string().datetime({ offset: true }) }).strict()).max(49),
}).strict()
const requestSchema = z.object({ vaultId: z.string().uuid(), expectedVersion: z.number().int().min(1), expectedScopeKeyVersion: z.number().int().min(1), encryptedPayload: itemSchema }).strict()
type RouteContext = { params: Promise<{ itemId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { itemId } = await params
  if (!z.string().uuid().safeParse(itemId).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  if (new TextEncoder().encode(JSON.stringify(body) ?? '').byteLength > 1_048_576) return jsonNoStore({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  const input = parsed.data
  if (input.encryptedPayload.version !== input.expectedVersion + 1 || input.encryptedPayload.scopeKeyVersion !== input.expectedScopeKeyVersion + 1) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [item] = await db.select({ userId: vaultItems.userId, encryptedPayload: vaultItems.encryptedPayload })
    .from(vaultItems).where(and(eq(vaultItems.id, itemId), eq(vaultItems.vaultId, input.vaultId))).limit(1)
  if (!item || item.userId !== session.user.id) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const [vault] = await db.select({ userId: vaults.userId }).from(vaults).where(eq(vaults.id, input.vaultId)).limit(1)
  if (!vault || vault.userId !== session.user.id) return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)
  const currentScopeKeyVersion = item.encryptedPayload.scopeKeyVersion ?? 1
  if (item.encryptedPayload.version !== input.expectedVersion || currentScopeKeyVersion !== input.expectedScopeKeyVersion) return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)

  const now = new Date()
  const updated = await db.transaction(async (tx) => {
    const result = await tx.update(vaultItems).set({ encryptedPayload: input.encryptedPayload, updatedAt: now })
      .where(and(eq(vaultItems.id, itemId), eq(vaultItems.vaultId, input.vaultId), eq(vaultItems.userId, session.user.id), sql`${vaultItems.encryptedPayload}->>'version' = ${String(input.expectedVersion)}`))
      .returning({ id: vaultItems.id })
    if (!result.length) return false
    await tx.update(scopedShares).set({ status: 'revoked', revokedAt: now, updatedAt: now })
      .where(and(eq(scopedShares.ownerId, session.user.id), eq(scopedShares.resourceType, 'secret'), eq(scopedShares.resourceId, itemId)))
    await tx.update(privateShareLinks).set({ revokedAt: now })
      .where(and(eq(privateShareLinks.ownerId, session.user.id), eq(privateShareLinks.resourceType, 'secret'), eq(privateShareLinks.resourceId, itemId)))
    await tx.insert(keyRotationJobs).values({
      id: crypto.randomUUID(), vaultId: input.vaultId, ownerId: session.user.id, resourceType: 'secret', resourceId: itemId,
      fromVersion: input.expectedScopeKeyVersion, toVersion: input.encryptedPayload.scopeKeyVersion,
      status: 'completed', completedCount: 1, totalCount: 1, createdAt: now, updatedAt: now,
    })
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId: input.vaultId, event: 'secret_key_rotated', targetKind: 'secret', targetId: itemId })
    return true
  })
  if (!updated) return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
  return jsonNoStore({ rotated: true, version: input.encryptedPayload.scopeKeyVersion })
}
