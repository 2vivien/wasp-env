import { and, eq, isNull, sql } from 'drizzle-orm'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, keyRotationJobs, vaultItems, vaults } from '@/lib/db/schema'
import { can } from '@/lib/permissions'
import { getVaultAccess } from '@/lib/vault-access'

type RouteContext = { params: Promise<{ vaultId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { vaultId } = await params
  const access = await getVaultAccess(session.user.id, vaultId)
  if (!access || !can(access.role, 'manage', access.permissions)) return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)

  const [vault] = await db.select({ keyVersion: vaults.keyVersion }).from(vaults)
    .where(and(eq(vaults.id, vaultId), isNull(vaults.deletedAt))).limit(1)
  if (!vault) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(vaultItems)
    .where(eq(vaultItems.vaultId, vaultId))
  const jobId = crypto.randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(keyRotationJobs).values({
      id: jobId, vaultId, ownerId: session.user.id,
      resourceType: 'vault', resourceId: vaultId,
      fromVersion: vault.keyVersion, toVersion: vault.keyVersion + 1,
      status: 'pending', totalCount: count?.count ?? 0,
    })
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(), actorId: session.user.id, vaultId,
      event: 'vault_rotation_started', targetKind: 'vault', targetId: vaultId,
      metadata: { keyVersion: vault.keyVersion + 1 },
    })
  })
  return jsonNoStore({ jobId, total: count?.count ?? 0 }, 201)
}
