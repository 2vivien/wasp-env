import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, keyRotationJobs, vaultKeyEnvelopes, vaultMembers, vaults } from '@/lib/db/schema'
import { can, normalizeOverrides, type Role } from '@/lib/permissions'
import { getVaultAccess } from '@/lib/vault-access'

type RouteContext = { params: Promise<{ vaultId: string; userId: string }> }

const patchSchema = z.object({
  role: z.enum(['viewer', 'user', 'editor', 'admin', 'owner']).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
}).strict().refine((value) => value.role !== undefined || value.permissions !== undefined)

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { vaultId, userId } = await params
  const access = await getVaultAccess(session.user.id, vaultId)
  if (!access || !can(access.role, 'manage', access.permissions)) return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)
  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [current] = await db.select({ role: vaultMembers.role }).from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId))).limit(1)
  if (!current) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  if (current.role === 'owner' && parsed.data.role && parsed.data.role !== 'owner') {
    return jsonNoStore({ error: { code: 'OWNER_ROLE_PROTECTED' } }, 409)
  }

  const [updated] = await db.update(vaultMembers).set({
    ...(parsed.data.role ? { role: parsed.data.role as Role } : {}),
    ...(parsed.data.permissions ? { permissions: normalizeOverrides(parsed.data.permissions) } : {}),
  }).where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)))
    .returning({ userId: vaultMembers.userId })
  if (!updated) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(), actorId: session.user.id, vaultId,
    event: 'vault_member_updated', targetKind: 'vault_member', targetId: userId,
    metadata: parsed.data.role ? { role: parsed.data.role } : { permissionsChanged: true },
  })
  return jsonNoStore({ updated: true })
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { vaultId, userId } = await params
  const access = await getVaultAccess(session.user.id, vaultId)
  if (!access || !can(access.role, 'manage', access.permissions)) return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)
  if (userId === access.ownerId) return jsonNoStore({ error: { code: 'OWNER_REMOVE_FORBIDDEN' } }, 409)

  const removed = await db.transaction(async (tx) => {
    const [row] = await tx.delete(vaultMembers)
      .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)))
      .returning({ userId: vaultMembers.userId })
    if (!row) return false
    await tx.delete(vaultKeyEnvelopes).where(and(eq(vaultKeyEnvelopes.vaultId, vaultId), eq(vaultKeyEnvelopes.userId, userId)))
    const [vault] = await tx.select({ keyVersion: vaults.keyVersion }).from(vaults).where(eq(vaults.id, vaultId)).limit(1)
    await tx.insert(keyRotationJobs).values({
      id: crypto.randomUUID(), vaultId, ownerId: session.user.id,
      resourceType: 'vault', resourceId: vaultId,
      fromVersion: vault?.keyVersion ?? 1,
      toVersion: (vault?.keyVersion ?? 1) + 1,
      status: 'pending',
    })
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(), actorId: session.user.id, vaultId,
      event: 'vault_member_removed', targetKind: 'vault_member', targetId: userId,
    })
    return true
  })
  return removed ? jsonNoStore({ removed: true, rotationRequired: true }) : jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
}
