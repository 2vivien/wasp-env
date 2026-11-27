import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, vaultItems } from '@/lib/db/schema'
import { can } from '@/lib/permissions'
import { getVaultAccess } from '@/lib/vault-access'
import type { EncryptedVaultItem } from '@/src/crypto/vault-key'

type RouteContext = { params: Promise<{ itemId: string }> }

const blobSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal('A256GCM'),
    nonce: z.string().min(16).max(32),
    ct: z.string().min(24).max(850_000),
  })
  .strict()
const payloadSchema = z
  .object({
    version: z.number().int().min(1),
    scopeKeyVersion: z.number().int().min(1).optional(),
    scopeKeyEnvelope: blobSchema.optional(),
    metadata: blobSchema,
    value: blobSchema,
    history: z
      .array(
        z
          .object({
            version: z.number().int().min(1),
            metadata: blobSchema,
            value: blobSchema,
            createdAt: z.string().datetime({ offset: true }),
          })
          .strict(),
      )
      .max(49)
      .optional(),
  })
  .strict()

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true))
    return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { itemId } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }
  const parsed = z
    .object({
      targetVaultId: z.string().uuid(),
      encryptedPayload: payloadSchema,
    })
    .strict()
    .safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [item] = await db
    .select({ vaultId: vaultItems.vaultId })
    .from(vaultItems)
    .where(eq(vaultItems.id, itemId))
    .limit(1)
  if (!item) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const source = await getVaultAccess(session.user.id, item.vaultId)
  const target = await getVaultAccess(session.user.id, parsed.data.targetVaultId)
  if (!source || !target) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  if (
    !can(source.role, 'delete', source.permissions) ||
    !can(target.role, 'create', target.permissions)
  ) {
    return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)
  }

  const moved = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(vaultItems)
      .where(and(eq(vaultItems.id, itemId), eq(vaultItems.vaultId, item.vaultId)))
      .returning({ id: vaultItems.id })
    if (!deleted) return false
    await tx.insert(vaultItems).values({
      id: itemId,
      vaultId: parsed.data.targetVaultId,
      userId: target.ownerId,
      encryptedPayload: parsed.data.encryptedPayload as EncryptedVaultItem,
    })
    await tx.insert(auditLogs).values([
      {
        id: crypto.randomUUID(),
        actorId: session.user.id,
        vaultId: item.vaultId,
        event: 'vault_item_moved_out',
        targetKind: 'vault_item',
        targetId: itemId,
        metadata: { targetVaultId: parsed.data.targetVaultId },
      },
      {
        id: crypto.randomUUID(),
        actorId: session.user.id,
        vaultId: parsed.data.targetVaultId,
        event: 'vault_item_moved_in',
        targetKind: 'vault_item',
        targetId: itemId,
        metadata: { sourceVaultId: item.vaultId },
      },
    ])
    return true
  })
  return moved
    ? jsonNoStore({ moved: true, vaultId: parsed.data.targetVaultId })
    : jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
}
