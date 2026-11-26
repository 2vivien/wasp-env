import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, environments, profiles, projects, scopedShares, userKeyMaterial, vaultGroupMembers, vaultGroups, vaultItems } from '@/lib/db/schema'
import { normalizeOverrides, permissionsForRole } from '@/lib/permissions'
import { limitRequest } from '@/lib/rate-limit'

const encryptedScopeKeySchema = z.object({ v: z.literal(1), alg: z.literal('X25519-SEAL'), ct: z.string().regex(/^[A-Za-z0-9_-]{107,5500}$/) }).strict()
const createSchema = z.object({
  vaultId: z.string().uuid(), resourceId: z.string().uuid(), resourceType: z.enum(['secret','project']), recipientHandle: z.string().trim().min(2).max(32), groupId: z.string().uuid().nullable().optional(),
  keyVersion: z.number().int().min(1), encryptedScopeKey: encryptedScopeKeySchema, expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  role: z.enum(['viewer', 'user', 'editor', 'admin', 'owner']).default('viewer'),
  permissions: z.record(z.string(), z.boolean()).optional(),
}).strict()

export async function GET() {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const [incoming, outgoing] = await Promise.all([
    db.select({ id: scopedShares.id, vaultId: scopedShares.vaultId, resourceId: scopedShares.resourceId, resourceType: scopedShares.resourceType, keyVersion: scopedShares.keyVersion, permissions: scopedShares.permissions, encryptedScopeKey: scopedShares.encryptedScopeKey, status: scopedShares.status, expiresAt: scopedShares.expiresAt, createdAt: scopedShares.createdAt, ownerHandle: profiles.handle })
      .from(scopedShares).innerJoin(profiles, eq(profiles.userId, scopedShares.ownerId))
      .where(eq(scopedShares.recipientId, session.user.id)).orderBy(scopedShares.createdAt),
    db.select({ id: scopedShares.id, vaultId: scopedShares.vaultId, resourceId: scopedShares.resourceId, resourceType: scopedShares.resourceType, keyVersion: scopedShares.keyVersion, permissions: scopedShares.permissions, status: scopedShares.status, expiresAt: scopedShares.expiresAt, createdAt: scopedShares.createdAt, recipientHandle: profiles.handle })
      .from(scopedShares).innerJoin(profiles, eq(profiles.userId, scopedShares.recipientId))
      .where(eq(scopedShares.ownerId, session.user.id)).orderBy(scopedShares.createdAt),
  ])
  return jsonNoStore({ incoming, outgoing })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const limit = await limitRequest(request, 'invitations', 30, 3600).catch(() => ({ allowed: true, remaining: 30 }))
  if (!limit.allowed) return jsonNoStore({ error: { code: 'RATE_LIMITED' } }, 429)
  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const handle = parsed.data.recipientHandle.replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9_]{2,32}$/.test(handle)) return jsonNoStore({ error: { code: 'INVALID_HANDLE' } }, 422)
  const [recipient] = await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.handleNormalized, handle)).limit(1)
  if (!recipient) return jsonNoStore({ error: { code: 'USER_NOT_FOUND' } }, 404)
  if (recipient.userId === session.user.id) return jsonNoStore({ error: { code: 'SELF_SHARE' } }, 422)
  if (parsed.data.groupId) {
    const [group] = await db.select({ id: vaultGroups.id }).from(vaultGroups).where(and(eq(vaultGroups.id, parsed.data.groupId), eq(vaultGroups.ownerId, session.user.id))).limit(1)
    const [membership] = await db.select({ id: vaultGroupMembers.id }).from(vaultGroupMembers).where(and(eq(vaultGroupMembers.groupId, parsed.data.groupId), eq(vaultGroupMembers.userId, recipient.userId))).limit(1)
    if (!group || !membership) return jsonNoStore({ error: { code: 'GROUP_MEMBER_REQUIRED' } }, 403)
  }
  const [keyMaterial] = await db.select({ userId: userKeyMaterial.userId }).from(userKeyMaterial).where(eq(userKeyMaterial.userId, recipient.userId)).limit(1)
  if (!keyMaterial) return jsonNoStore({ error: { code: 'RECIPIENT_KEYS_UNAVAILABLE' } }, 409)

  if (parsed.data.resourceType === 'secret') {
    const [item] = await db.select({ id: vaultItems.id, encryptedPayload: vaultItems.encryptedPayload }).from(vaultItems).where(and(eq(vaultItems.id, parsed.data.resourceId), eq(vaultItems.vaultId, parsed.data.vaultId), eq(vaultItems.userId, session.user.id))).limit(1)
    if (!item) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
    if ((item.encryptedPayload.scopeKeyVersion ?? 1) !== parsed.data.keyVersion) return jsonNoStore({ error: { code: 'STALE_SCOPE_KEY' } }, 409)
  } else {
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, parsed.data.resourceId), eq(projects.vaultId, parsed.data.vaultId), eq(projects.userId, session.user.id))).limit(1)
    if (!project) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
    const [environmentCount] = await db.select({ count: sql<number>`count(*)::int` }).from(environments).where(and(eq(environments.projectId, project.id), eq(environments.userId, session.user.id)))
    if ((environmentCount?.count ?? 0) > 20) return jsonNoStore({ error: { code: 'PROJECT_SCOPE_LIMIT' } }, 409)
    if (parsed.data.keyVersion !== 1) return jsonNoStore({ error: { code: 'STALE_SCOPE_KEY' } }, 409)
  }
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
  if (expiresAt && (expiresAt <= new Date() || expiresAt > new Date(Date.now() + 90 * 24 * 60 * 60 * 1000))) return jsonNoStore({ error: { code: 'INVALID_EXPIRATION' } }, 422)

  const id = crypto.randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(scopedShares).values({
      id, vaultId: parsed.data.vaultId, ownerId: session.user.id, recipientId: recipient.userId,
      groupId: parsed.data.groupId ?? null, resourceType: parsed.data.resourceType, resourceId: parsed.data.resourceId,
      encryptedScopeKey: parsed.data.encryptedScopeKey, keyVersion: parsed.data.keyVersion,
      permissions: {
        ...Object.fromEntries(permissionsForRole(parsed.data.role).map((permission) => [permission, true])),
        ...normalizeOverrides(parsed.data.permissions),
        view: true,
      },
      status: 'pending', expiresAt,
    })
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId: parsed.data.vaultId, event: parsed.data.resourceType === 'secret' ? 'scoped_secret_share_created' : 'scoped_project_share_created', targetKind: parsed.data.resourceType, targetId: parsed.data.resourceId })
  })
  return jsonNoStore({ id }, 201)
}
