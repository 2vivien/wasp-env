import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { normalizeOverrides, can, type PermissionOverrides, type Role } from '@/lib/permissions'
import { vaultMembers, vaultShares, vaults } from '@/lib/db/schema'

export type VaultAccess = {
  ownerId: string
  role: Role
  permissions: PermissionOverrides
  permission: 'read' | 'write'
}

export async function getVaultAccess(userId: string, vaultId: string): Promise<VaultAccess | null> {
  const [owned] = await db.select({ ownerId: vaults.userId }).from(vaults)
    .where(and(eq(vaults.id, vaultId), eq(vaults.userId, userId), isNull(vaults.deletedAt))).limit(1)
  if (owned) {
    return { ownerId: owned.ownerId, role: 'owner', permissions: {}, permission: 'write' }
  }

  const [member] = await db.select({
    ownerId: vaults.userId,
    role: vaultMembers.role,
    permissions: vaultMembers.permissions,
  }).from(vaultMembers)
    .innerJoin(vaults, eq(vaults.id, vaultMembers.vaultId))
    .where(and(
      eq(vaultMembers.vaultId, vaultId),
      eq(vaultMembers.userId, userId),
      isNull(vaults.deletedAt),
    )).limit(1)
  if (member) {
    const permissions = normalizeOverrides(member.permissions)
    return {
      ownerId: member.ownerId,
      role: member.role,
      permissions,
      permission: can(member.role, 'update', permissions) ? 'write' : 'read',
    }
  }

  const now = new Date()
  const [share] = await db.select({ ownerId: vaultShares.ownerId, permission: vaultShares.permission }).from(vaultShares)
    .where(and(
      eq(vaultShares.vaultId, vaultId),
      eq(vaultShares.recipientId, userId),
      eq(vaultShares.status, 'accepted'),
      or(isNull(vaultShares.expiresAt), gt(vaultShares.expiresAt, now)),
    )).limit(1)
  if (!share) return null
  return {
    ownerId: share.ownerId,
    role: share.permission === 'write' ? 'editor' : 'viewer',
    permissions: {},
    permission: share.permission,
  }
}
