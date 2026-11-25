import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { profiles, vaultGroupMembers, vaultGroups } from '@/lib/db/schema'

const groupName = z.string().trim().min(1).max(48)

export async function GET() {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)

  const groups = await db.select({ id: vaultGroups.id, name: vaultGroups.name, createdAt: vaultGroups.createdAt })
    .from(vaultGroups).where(eq(vaultGroups.ownerId, session.user.id)).orderBy(vaultGroups.createdAt)
  if (!groups.length) return jsonNoStore({ groups: [] })

  const members = await db.select({ groupId: vaultGroupMembers.groupId, userId: vaultGroupMembers.userId, handle: profiles.handle, displayName: profiles.displayName })
    .from(vaultGroupMembers).innerJoin(profiles, eq(profiles.userId, vaultGroupMembers.userId))
    .innerJoin(vaultGroups, and(eq(vaultGroups.id, vaultGroupMembers.groupId), eq(vaultGroups.ownerId, session.user.id)))
  const byGroup = new Map<string, Array<{ userId: string; handle: string | null; displayName: string | null }>>()
  for (const member of members) {
    const entries = byGroup.get(member.groupId) ?? []
    entries.push({ userId: member.userId, handle: member.handle, displayName: member.displayName })
    byGroup.set(member.groupId, entries)
  }
  return jsonNoStore({ groups: groups.map((group) => ({ ...group, members: byGroup.get(group.id) ?? [] })) })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = z.object({ name: groupName }).strict().safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(vaultGroups).where(eq(vaultGroups.ownerId, session.user.id))
  if ((count?.count ?? 0) >= 25) return jsonNoStore({ error: { code: 'GROUP_LIMIT' } }, 409)

  const id = crypto.randomUUID()
  await db.insert(vaultGroups).values({ id, ownerId: session.user.id, name: parsed.data.name })
  return jsonNoStore({ id }, 201)
}
