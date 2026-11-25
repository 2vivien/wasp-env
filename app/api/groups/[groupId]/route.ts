import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { profiles, scopedShares, vaultGroupMembers, vaultGroups } from '@/lib/db/schema'

const contextSchema = z.object({ groupId: z.string().uuid() })
const bodySchema = z.object({
  name: z.string().trim().min(1).max(48).optional(),
  addHandle: z.string().trim().min(2).max(32).optional(),
  removeUserId: z.string().uuid().optional(),
}).strict().refine((value) => Number(Boolean(value.name)) + Number(Boolean(value.addHandle)) + Number(Boolean(value.removeUserId)) === 1)

type RouteContext = { params: Promise<{ groupId: string }> }

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { groupId } = await params
  if (!contextSchema.safeParse({ groupId }).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [group] = await db.select({ id: vaultGroups.id }).from(vaultGroups)
    .where(and(eq(vaultGroups.id, groupId), eq(vaultGroups.ownerId, session.user.id))).limit(1)
  if (!group) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  if (parsed.data.name) {
    await db.update(vaultGroups).set({ name: parsed.data.name, updatedAt: new Date() })
      .where(and(eq(vaultGroups.id, groupId), eq(vaultGroups.ownerId, session.user.id)))
    return jsonNoStore({ updated: true })
  }

  if (parsed.data.addHandle) {
    const handle = parsed.data.addHandle.replace(/^@/, '').toLowerCase()
    if (!/^[a-z0-9_]{2,32}$/.test(handle)) return jsonNoStore({ error: { code: 'INVALID_HANDLE' } }, 422)
    const [member] = await db.select({ userId: profiles.userId }).from(profiles)
      .where(eq(profiles.handleNormalized, handle)).limit(1)
    if (!member) return jsonNoStore({ error: { code: 'USER_NOT_FOUND' } }, 404)
    if (member.userId === session.user.id) return jsonNoStore({ error: { code: 'SELF_MEMBER' } }, 422)
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(vaultGroupMembers).where(eq(vaultGroupMembers.groupId, groupId))
    const [existing] = await db.select({ id: vaultGroupMembers.id }).from(vaultGroupMembers)
      .where(and(eq(vaultGroupMembers.groupId, groupId), eq(vaultGroupMembers.userId, member.userId))).limit(1)
    if (!existing && (count?.count ?? 0) >= 100) return jsonNoStore({ error: { code: 'MEMBER_LIMIT' } }, 409)
    if (!existing) await db.insert(vaultGroupMembers).values({ id: crypto.randomUUID(), groupId, userId: member.userId })
    return jsonNoStore({ memberAdded: true })
  }

  const memberId = parsed.data.removeUserId
  if (memberId) {
    await db.transaction(async (tx) => {
      await tx.delete(vaultGroupMembers).where(and(eq(vaultGroupMembers.groupId, groupId), eq(vaultGroupMembers.userId, memberId)))
      await tx.update(scopedShares).set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(scopedShares.groupId, groupId), eq(scopedShares.ownerId, session.user.id), eq(scopedShares.recipientId, memberId)))
    })
    return jsonNoStore({ memberRemoved: true })
  }
  return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { groupId } = await params
  if (!contextSchema.safeParse({ groupId }).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const now = new Date()
  const removed = await db.transaction(async (tx) => {
    const [group] = await tx.delete(vaultGroups).where(and(eq(vaultGroups.id, groupId), eq(vaultGroups.ownerId, session.user.id))).returning({ id: vaultGroups.id })
    if (!group) return false
    await tx.delete(vaultGroupMembers).where(eq(vaultGroupMembers.groupId, groupId))
    await tx.update(scopedShares).set({ status: 'revoked', revokedAt: now, updatedAt: now })
      .where(and(eq(scopedShares.groupId, groupId), eq(scopedShares.ownerId, session.user.id)))
    return true
  })
  return removed ? jsonNoStore({ deleted: true }) : jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
}
