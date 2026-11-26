import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, profiles, vaultMembers, vaults } from '@/lib/db/schema'
import { getVaultAccess } from '@/lib/vault-access'
import { normalizeHandle } from '@/src/modules/identity/handle'

type RouteContext = { params: Promise<{ vaultId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { vaultId } = await params
  const access = await getVaultAccess(session.user.id, vaultId)
  if (!access || access.role !== 'owner') return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)

  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = z.object({ newOwnerHandle: z.string().min(3).max(32) }).strict().safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [recipient] = await db.select({ userId: profiles.userId }).from(profiles)
    .where(eq(profiles.handleNormalized, normalizeHandle(parsed.data.newOwnerHandle))).limit(1)
  if (!recipient || recipient.userId === session.user.id) return jsonNoStore({ error: { code: 'RECIPIENT_NOT_FOUND' } }, 404)
  const [member] = await db.select({ userId: vaultMembers.userId }).from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, recipient.userId))).limit(1)
  if (!member) return jsonNoStore({ error: { code: 'MEMBER_REQUIRED' } }, 409)

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(vaults).set({ userId: recipient.userId, updatedAt: new Date() })
      .where(and(eq(vaults.id, vaultId), eq(vaults.userId, session.user.id))).returning({ id: vaults.id })
    if (!updated) return false
    await tx.update(vaultMembers).set({ role: 'admin' })
      .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, session.user.id)))
    await tx.update(vaultMembers).set({ role: 'owner' })
      .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, recipient.userId)))
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(), actorId: session.user.id, vaultId,
      event: 'vault_owner_transferred', targetKind: 'vault', targetId: vaultId,
    })
    return true
  })
  return result ? jsonNoStore({ transferred: true }) : jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
}
