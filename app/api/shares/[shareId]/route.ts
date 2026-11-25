import { and, eq, gt, isNull, ne, or } from 'drizzle-orm'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, vaultShares } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ shareId: string }> }

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { shareId } = await params
  const now = new Date()
  const [updated] = await db.update(vaultShares).set({ status: 'accepted', acceptedAt: now, updatedAt: now })
    .where(and(eq(vaultShares.id, shareId), eq(vaultShares.recipientId, session.user.id), eq(vaultShares.status, 'pending'), or(isNull(vaultShares.expiresAt), gt(vaultShares.expiresAt, now))))
    .returning({ id: vaultShares.id, vaultId: vaultShares.vaultId })
  if (!updated) return jsonNoStore({ error: { code: 'NOT_FOUND_OR_EXPIRED' } }, 404)
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId: updated.vaultId, event: 'vault_share_accepted', targetKind: 'vault_share', targetId: updated.id })
  return jsonNoStore({ status: 'accepted' })
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { shareId } = await params
  const [updated] = await db.update(vaultShares).set({ status: 'revoked', updatedAt: new Date() })
    .where(and(eq(vaultShares.id, shareId), eq(vaultShares.ownerId, session.user.id), ne(vaultShares.status, 'revoked')))
    .returning({ id: vaultShares.id, vaultId: vaultShares.vaultId })
  if (!updated) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId: updated.vaultId, event: 'vault_share_revoked', targetKind: 'vault_share', targetId: updated.id })
  return jsonNoStore({ revoked: true })
}
