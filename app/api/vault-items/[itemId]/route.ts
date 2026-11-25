import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { jsonNoStore, hasValidMutationHeaders } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { vaultItems } from '@/lib/db/schema'

const encryptedBlobSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  nonce: z.string().min(16).max(32),
  ct: z.string().min(24).max(100_000),
}).strict()

const updateItemSchema = z.object({
  vaultId: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
  nextVersion: z.number().int().min(2),
  metadata: encryptedBlobSchema,
  value: encryptedBlobSchema,
}).strict().refine((payload) => payload.nextVersion === payload.expectedVersion + 1)

type RouteContext = { params: Promise<{ itemId: string }> }

export async function PUT(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

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

  const parsed = updateItemSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const rows = await db.select({ encryptedPayload: vaultItems.encryptedPayload, updatedAt: vaultItems.updatedAt })
    .from(vaultItems).where(and(
      eq(vaultItems.id, itemId),
      eq(vaultItems.vaultId, parsed.data.vaultId),
      eq(vaultItems.userId, session.user.id),
    )).limit(1)
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

  const updated = await db.update(vaultItems).set({
    encryptedPayload: {
      version: parsed.data.nextVersion,
      metadata: parsed.data.metadata,
      value: parsed.data.value,
      history,
    },
    updatedAt: new Date(),
  }).where(and(
    eq(vaultItems.id, itemId),
    eq(vaultItems.vaultId, parsed.data.vaultId),
    eq(vaultItems.userId, session.user.id),
    sql`${vaultItems.encryptedPayload}->>'version' = ${String(parsed.data.expectedVersion)}`,
  )).returning({ id: vaultItems.id })

  if (updated.length === 0) return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
  return jsonNoStore({ id: itemId, version: parsed.data.nextVersion })
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  const { itemId } = await params
  if (!z.string().uuid().safeParse(itemId).success) {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const deleted = await db.delete(vaultItems).where(and(
    eq(vaultItems.id, itemId),
    eq(vaultItems.userId, session.user.id),
  )).returning({ id: vaultItems.id })

  if (deleted.length === 0) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  return jsonNoStore({ deleted: true })
}
