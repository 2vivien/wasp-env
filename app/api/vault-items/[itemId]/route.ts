import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { jsonNoStore, hasValidMutationHeaders } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, vaultItemVersions, vaultItems } from '@/lib/db/schema'
import { previousVersionRow } from '@/lib/vault-item-versions'
import { getVaultAccess } from '@/lib/vault-access'
import { can } from '@/lib/permissions'

const encryptedBlobSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal('A256GCM'),
    nonce: z.string().min(16).max(32),
    ct: z.string().min(24).max(100_000),
  })
  .strict()

const updateItemSchema = z
  .object({
    vaultId: z.string().uuid(),
    scopeKeyVersion: z.number().int().min(1).optional(),
    expectedVersion: z.number().int().min(1),
    nextVersion: z.number().int().min(2),
    metadata: encryptedBlobSchema,
    value: encryptedBlobSchema,
  })
  .strict()
  .refine((payload) => payload.nextVersion === payload.expectedVersion + 1)

type RouteContext = { params: Promise<{ itemId: string }> }

export async function PUT(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true))
    return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  const { itemId } = await params
  if (!z.string().uuid().safeParse(itemId).success) {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const bodySize = new TextEncoder().encode(JSON.stringify(body) ?? '').byteLength
  if (bodySize > 1_048_576) return jsonNoStore({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)

  const parsed = updateItemSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const access = await getVaultAccess(session.user.id, parsed.data.vaultId)
  if (!access) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  if (!can(access.role, 'update', access.permissions))
    return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)
  const rows = await db
    .select({ encryptedPayload: vaultItems.encryptedPayload, updatedAt: vaultItems.updatedAt })
    .from(vaultItems)
    .where(
      and(
        eq(vaultItems.id, itemId),
        eq(vaultItems.vaultId, parsed.data.vaultId),
        eq(vaultItems.userId, access.ownerId),
      ),
    )
    .limit(1)
  const current = rows[0]
  if (!current) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  if (current.encryptedPayload.version !== parsed.data.expectedVersion) {
    return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
  }

  const history = [
    ...(current.encryptedPayload.history ?? []),
    {
      version: current.encryptedPayload.version,
      metadata: current.encryptedPayload.metadata,
      value: current.encryptedPayload.value,
      createdAt: current.updatedAt.toISOString(),
    },
  ].slice(-49)

  const updated = await db.transaction(async (tx) => {
    await tx
      .insert(vaultItemVersions)
      .values(
        previousVersionRow({
          itemId,
          vaultId: parsed.data.vaultId,
          userId: access.ownerId,
          version: current.encryptedPayload.version,
          metadata: current.encryptedPayload.metadata,
          value: current.encryptedPayload.value,
          updatedAt: current.updatedAt,
        }),
      )
      .onConflictDoNothing()
    const rows = await tx
      .update(vaultItems)
      .set({
        encryptedPayload: {
          version: parsed.data.nextVersion,
          scopeKeyVersion:
            parsed.data.scopeKeyVersion ?? current.encryptedPayload.scopeKeyVersion ?? 1,
          scopeKeyEnvelope: current.encryptedPayload.scopeKeyEnvelope,
          metadata: parsed.data.metadata,
          value: parsed.data.value,
          history,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vaultItems.id, itemId),
          eq(vaultItems.vaultId, parsed.data.vaultId),
          eq(vaultItems.userId, access.ownerId),
          sql`${vaultItems.encryptedPayload}->>'version' = ${String(parsed.data.expectedVersion)}`,
        ),
      )
      .returning({ id: vaultItems.id })
    if (rows.length)
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        vaultId: parsed.data.vaultId,
        event: 'vault_item_updated',
        targetKind: 'vault_item',
        targetId: itemId,
      })
    return rows
  })

  if (updated.length === 0) return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
  return jsonNoStore({ id: itemId, version: parsed.data.nextVersion })
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false))
    return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  const { itemId } = await params
  if (!z.string().uuid().safeParse(itemId).success) {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const [item] = await db
    .select({ vaultId: vaultItems.vaultId })
    .from(vaultItems)
    .where(eq(vaultItems.id, itemId))
    .limit(1)
  if (!item) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const access = await getVaultAccess(session.user.id, item.vaultId)
  if (!access) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  if (!can(access.role, 'delete', access.permissions))
    return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)
  const deleted = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(vaultItems)
      .where(
        and(
          eq(vaultItems.id, itemId),
          eq(vaultItems.vaultId, item.vaultId),
          eq(vaultItems.userId, access.ownerId),
        ),
      )
      .returning({ id: vaultItems.id })
    if (rows.length)
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        vaultId: item.vaultId,
        event: 'vault_item_deleted',
        targetKind: 'vault_item',
        targetId: itemId,
      })
    return rows
  })

  if (deleted.length === 0) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  return jsonNoStore({ deleted: true })
}
