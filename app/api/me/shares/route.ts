import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { user, vaultShares } from '@/lib/db/schema'

export async function GET() {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const rows = await db.select({
    id: vaultShares.id,
    vaultId: vaultShares.vaultId,
    encryptedVaultKey: vaultShares.encryptedVaultKey,
    permission: vaultShares.permission,
    status: vaultShares.status,
    expiresAt: vaultShares.expiresAt,
    createdAt: vaultShares.createdAt,
    ownerName: user.name,
  }).from(vaultShares).innerJoin(user, eq(vaultShares.ownerId, user.id))
    .where(and(
      eq(vaultShares.recipientId, session.user.id),
      inArray(vaultShares.status, ['pending', 'accepted']),
      or(isNull(vaultShares.expiresAt), gt(vaultShares.expiresAt, new Date())),
    ))
  return jsonNoStore({ shares: rows })
}
