import { and, eq, inArray, sql } from 'drizzle-orm'
import { getCurrentSession } from '@/lib/auth/session'
import { jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { profiles, scopedShares, vaultShares } from '@/lib/db/schema'

type ShareStatus = 'pending' | 'accepted' | 'revoked'

export async function GET(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const requested = new URL(request.url).searchParams.get('status')
  const allowed: ShareStatus[] = requested === 'pending' || requested === 'accepted' || requested === 'revoked'
    ? [requested]
    : ['pending', 'accepted', 'revoked']
  if (requested === 'expired') return jsonNoStore({ incoming: [], outgoing: [] })
  const vaultKind = sql<string>`'vault'`

  const [scopedIncoming, scopedOutgoing, vaultIncoming, vaultOutgoing] = await Promise.all([
    db.select({
      id: scopedShares.id, kind: scopedShares.resourceType, targetId: scopedShares.resourceId,
      status: scopedShares.status, expiresAt: scopedShares.expiresAt, createdAt: scopedShares.createdAt,
      fromHandle: profiles.handle,
    }).from(scopedShares).innerJoin(profiles, eq(profiles.userId, scopedShares.ownerId))
      .where(and(eq(scopedShares.recipientId, session.user.id), inArray(scopedShares.status, allowed))),
    db.select({
      id: scopedShares.id, kind: scopedShares.resourceType, targetId: scopedShares.resourceId,
      status: scopedShares.status, expiresAt: scopedShares.expiresAt, createdAt: scopedShares.createdAt,
      toHandle: profiles.handle,
    }).from(scopedShares).innerJoin(profiles, eq(profiles.userId, scopedShares.recipientId))
      .where(and(eq(scopedShares.ownerId, session.user.id), inArray(scopedShares.status, allowed))),
    db.select({
      id: vaultShares.id, kind: vaultKind, targetId: vaultShares.vaultId,
      status: vaultShares.status, expiresAt: vaultShares.expiresAt, createdAt: vaultShares.createdAt,
      fromHandle: profiles.handle,
    }).from(vaultShares).innerJoin(profiles, eq(profiles.userId, vaultShares.ownerId))
      .where(and(eq(vaultShares.recipientId, session.user.id), inArray(vaultShares.status, allowed))),
    db.select({
      id: vaultShares.id, kind: vaultKind, targetId: vaultShares.vaultId,
      status: vaultShares.status, expiresAt: vaultShares.expiresAt, createdAt: vaultShares.createdAt,
      toHandle: profiles.handle,
    }).from(vaultShares).innerJoin(profiles, eq(profiles.userId, vaultShares.recipientId))
      .where(and(eq(vaultShares.ownerId, session.user.id), inArray(vaultShares.status, allowed))),
  ])

  return jsonNoStore({
    incoming: [
      ...scopedIncoming.map((row) => ({ ...row, source: 'scoped' as const })),
      ...vaultIncoming.map((row) => ({ ...row, source: 'vault' as const })),
    ],
    outgoing: [
      ...scopedOutgoing.map((row) => ({ ...row, source: 'scoped' as const })),
      ...vaultOutgoing.map((row) => ({ ...row, source: 'vault' as const })),
    ],
  })
}
