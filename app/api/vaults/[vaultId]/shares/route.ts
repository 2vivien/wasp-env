import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, profiles, vaultShares, vaults } from '@/lib/db/schema'

const encryptedKeySchema = z.object({
  v: z.literal(1),
  alg: z.literal('X25519-SEAL'),
  ct: z.string().regex(/^[A-Za-z0-9_-]{107}$/),
}).strict()

const createShareSchema = z.object({
  recipientHandle: z.string().trim().min(3).max(32),
  encryptedVaultKey: encryptedKeySchema,
  permission: z.enum(['read', 'write']),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict()

type RouteContext = { params: Promise<{ vaultId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { vaultId } = await params
  const rows = await db.select({
    id: vaultShares.id,
    recipientHandle: profiles.handle,
    permission: vaultShares.permission,
    status: vaultShares.status,
    expiresAt: vaultShares.expiresAt,
    createdAt: vaultShares.createdAt,
  }).from(vaultShares).innerJoin(profiles, eq(vaultShares.recipientId, profiles.userId)).where(and(eq(vaultShares.vaultId, vaultId), eq(vaultShares.ownerId, session.user.id)))
  return jsonNoStore({ shares: rows })
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  const { vaultId } = await params
  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = createShareSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [vault] = await db.select({ id: vaults.id }).from(vaults)
    .where(and(eq(vaults.id, vaultId), eq(vaults.userId, session.user.id))).limit(1)
  if (!vault) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const [recipient] = await db.select({ userId: profiles.userId }).from(profiles)
    .where(eq(profiles.handleNormalized, parsed.data.recipientHandle.toLowerCase())).limit(1)
  if (!recipient || recipient.userId === session.user.id) return jsonNoStore({ error: { code: 'RECIPIENT_NOT_FOUND' } }, 404)

  const shareId = crypto.randomUUID()
  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(vaultShares).values({
      id: shareId,
      vaultId,
      ownerId: session.user.id,
      recipientId: recipient.userId,
      encryptedVaultKey: parsed.data.encryptedVaultKey,
      permission: parsed.data.permission,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    }).onConflictDoNothing().returning({ id: vaultShares.id })
    if (!inserted) return false
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: session.user.id,
      vaultId,
      event: 'vault_share_created',
      targetKind: 'vault_share',
      targetId: shareId,
      metadata: { permission: parsed.data.permission },
    })
    return true
  })
  if (!created) return jsonNoStore({ error: { code: 'SHARE_ALREADY_EXISTS' } }, 409)
  return jsonNoStore({ id: shareId, status: 'pending' }, 201)
}
