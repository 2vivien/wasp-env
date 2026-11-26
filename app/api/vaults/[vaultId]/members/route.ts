import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, profiles, vaultKeyEnvelopes, vaultMembers } from '@/lib/db/schema'
import { can, normalizeOverrides } from '@/lib/permissions'
import { getVaultAccess } from '@/lib/vault-access'
import { normalizeHandle } from '@/src/modules/identity/handle'

type RouteContext = { params: Promise<{ vaultId: string }> }

const roleSchema = z.enum(['viewer', 'user', 'editor', 'admin'])
const sealedKeySchema = z.object({ v: z.literal(1), alg: z.literal('X25519-SEAL'), ct: z.string().regex(/^[A-Za-z0-9_-]{107}$/) }).strict()
const createSchema = z.object({
  recipientHandle: z.string().min(3).max(32),
  role: roleSchema,
  permissions: z.record(z.string(), z.boolean()).optional(),
  sealedKey: sealedKeySchema,
  senderPublicKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict()

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { vaultId } = await params
  const access = await getVaultAccess(session.user.id, vaultId)
  if (!access || !can(access.role, 'view', access.permissions)) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const rows = await db.select({
    userId: vaultMembers.userId,
    handle: profiles.handle,
    displayName: profiles.displayName,
    role: vaultMembers.role,
    permissions: vaultMembers.permissions,
    createdAt: vaultMembers.createdAt,
  }).from(vaultMembers)
    .innerJoin(profiles, eq(profiles.userId, vaultMembers.userId))
    .where(eq(vaultMembers.vaultId, vaultId))
  return jsonNoStore({ members: rows })
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { vaultId } = await params
  const access = await getVaultAccess(session.user.id, vaultId)
  if (!access || !can(access.role, 'manage', access.permissions)) return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)

  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [recipient] = await db.select({ userId: profiles.userId }).from(profiles)
    .where(eq(profiles.handleNormalized, normalizeHandle(parsed.data.recipientHandle))).limit(1)
  if (!recipient || recipient.userId === session.user.id) return jsonNoStore({ error: { code: 'RECIPIENT_NOT_FOUND' } }, 404)

  const result = await db.transaction(async (tx) => {
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(vaultMembers)
      .where(eq(vaultMembers.vaultId, vaultId))
    if ((count?.count ?? 0) >= 100) return 'MEMBER_LIMIT'
    const [existing] = await tx.select({ userId: vaultMembers.userId }).from(vaultMembers)
      .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, recipient.userId))).limit(1)
    if (existing) return 'ALREADY_EXISTS'
    await tx.insert(vaultMembers).values({
      vaultId,
      userId: recipient.userId,
      role: parsed.data.role,
      permissions: normalizeOverrides(parsed.data.permissions),
      addedBy: session.user.id,
    })
    await tx.insert(vaultKeyEnvelopes).values({
      vaultId,
      userId: recipient.userId,
      sealedKey: parsed.data.sealedKey,
      senderPublicKey: parsed.data.senderPublicKey,
    })
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(), actorId: session.user.id, vaultId,
      event: 'vault_member_added', targetKind: 'vault_member', targetId: recipient.userId,
      metadata: { role: parsed.data.role },
    })
    return 'CREATED'
  })
  if (result !== 'CREATED') return jsonNoStore({ error: { code: result } }, result === 'MEMBER_LIMIT' ? 409 : 409)
  return jsonNoStore({ added: true }, 201)
}
