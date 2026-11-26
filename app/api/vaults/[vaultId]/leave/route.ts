import { and, eq } from 'drizzle-orm'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, keyRotationJobs, vaultKeyEnvelopes, vaultMembers, vaults } from '@/lib/db/schema'
import { getVaultAccess } from '@/lib/vault-access'

type RouteContext = { params: Promise<{ vaultId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { vaultId } = await params
  const access = await getVaultAccess(session.user.id, vaultId)
  if (!access) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  if (access.role === 'owner') return jsonNoStore({ error: { code: 'TRANSFER_REQUIRED' } }, 409)

  const left = await db.transaction(async (tx) => {
    const [row] = await tx.delete(vaultMembers)
      .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, session.user.id)))
      .returning({ userId: vaultMembers.userId })
    if (!row) return false
    await tx.delete(vaultKeyEnvelopes).where(and(eq(vaultKeyEnvelopes.vaultId, vaultId), eq(vaultKeyEnvelopes.userId, session.user.id)))
    const [vault] = await tx.select({ keyVersion: vaults.keyVersion }).from(vaults).where(eq(vaults.id, vaultId)).limit(1)
    await tx.insert(keyRotationJobs).values({
      id: crypto.randomUUID(), vaultId, ownerId: access.ownerId,
      resourceType: 'vault', resourceId: vaultId,
      fromVersion: vault?.keyVersion ?? 1,
      toVersion: (vault?.keyVersion ?? 1) + 1,
      status: 'pending',
    })
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(), actorId: session.user.id, vaultId,
      event: 'vault_left', targetKind: 'vault', targetId: vaultId,
    })
    return true
  })
  return left ? jsonNoStore({ left: true, rotationRequired: true }) : jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
}
