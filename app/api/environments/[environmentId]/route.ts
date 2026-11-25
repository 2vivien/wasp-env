import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, environments } from '@/lib/db/schema'

const encryptedMetadataSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  nonce: z.string().min(16).max(32),
  ct: z.string().min(16).max(12000),
}).strict()

type RouteContext = { params: Promise<{ environmentId: string }> }

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = z.object({ encryptedMetadata: encryptedMetadataSchema }).strict().safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const { environmentId } = await params
  const [updated] = await db.update(environments).set({ encryptedMetadata: parsed.data.encryptedMetadata, updatedAt: new Date() })
    .where(and(eq(environments.id, environmentId), eq(environments.userId, session.user.id), isNull(environments.deletedAt)))
    .returning({ id: environments.id, vaultId: environments.vaultId })
  if (!updated) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  await db.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId: updated.vaultId, event: 'environment_updated', targetKind: 'environment', targetId: updated.id })
  return jsonNoStore({ updated: true })
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  const { environmentId } = await params
  const deletedAt = new Date()
  const deleted = await db.transaction(async (tx) => {
    const [environment] = await tx.update(environments).set({ deletedAt, updatedAt: deletedAt })
      .where(and(eq(environments.id, environmentId), eq(environments.userId, session.user.id), isNull(environments.deletedAt)))
      .returning({ id: environments.id, vaultId: environments.vaultId })
    if (!environment) return null
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId: environment.vaultId, event: 'environment_deleted', targetKind: 'environment', targetId: environment.id })
    return environment
  })
  if (!deleted) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  return jsonNoStore({ deleted: true })
}
