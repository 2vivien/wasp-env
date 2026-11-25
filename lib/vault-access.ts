import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vaultShares, vaults } from '@/lib/db/schema'

export async function getVaultAccess(userId: string, vaultId: string) {
  const [owned] = await db.select({ ownerId: vaults.userId }).from(vaults)
    .where(and(eq(vaults.id, vaultId), eq(vaults.userId, userId))).limit(1)
  if (owned) return { ownerId: owned.ownerId, permission: 'write' as const }
  const now = new Date()
  const [share] = await db.select({ ownerId: vaultShares.ownerId, permission: vaultShares.permission }).from(vaultShares)
    .where(and(
      eq(vaultShares.vaultId, vaultId),
      eq(vaultShares.recipientId, userId),
      eq(vaultShares.status, 'accepted'),
      or(isNull(vaultShares.expiresAt), gt(vaultShares.expiresAt, now)),
    )).limit(1)
  return share ?? null
}
