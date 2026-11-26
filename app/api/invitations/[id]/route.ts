import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, scopedShares, vaultShares } from '@/lib/db/schema'
import { limitRequest } from '@/lib/rate-limit'

type RouteContext = { params: Promise<{ id: string }> }

const requestSchema = z.object({
  source: z.enum(['scoped', 'vault']),
  action: z.enum(['accept', 'decline', 'revoke']),
}).strict()

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const limit = await limitRequest(request, 'invitations', 30, 3600).catch(() => ({ allowed: true, remaining: 30 }))
  if (!limit.allowed) return jsonNoStore({ error: { code: 'RATE_LIMITED' } }, 429)
  const { id } = await params
  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const table = parsed.data.source === 'scoped' ? scopedShares : vaultShares
  const isIncoming = parsed.data.action === 'accept' || parsed.data.action === 'decline'
  const userIdColumn = isIncoming ? table.recipientId : table.ownerId
  const nextStatus = parsed.data.action === 'accept' ? 'accepted' : 'revoked'

  const [updated] = await db.update(table).set({
    status: nextStatus,
    ...(parsed.data.action === 'accept' ? { acceptedAt: new Date() } : {}),
  }).where(and(eq(table.id, id), eq(userIdColumn, session.user.id))).returning({ id: table.id, vaultId: table.vaultId })
  if (!updated) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  await db.insert(auditLogs).values({
    id: crypto.randomUUID(), actorId: session.user.id, vaultId: updated.vaultId,
    event: `invitation_${parsed.data.action}`, targetKind: 'invitation', targetId: id,
  })
  return jsonNoStore({ updated: true })
}
