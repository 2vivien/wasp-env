import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, privateShareLinkUses, privateShareLinks } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const { token } = await params
  if (!z.string().regex(/^[A-Za-z0-9_-]{43}$/).safeParse(token).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const now = new Date()
  const [link] = await db.update(privateShareLinks).set({ useCount: sql`${privateShareLinks.useCount} + 1` })
    .where(and(
      eq(privateShareLinks.tokenHash, tokenHash), isNull(privateShareLinks.revokedAt),
      or(isNull(privateShareLinks.expiresAt), gt(privateShareLinks.expiresAt, now)),
      or(isNull(privateShareLinks.maxUses), sql`${privateShareLinks.useCount} < ${privateShareLinks.maxUses}`),
    )).returning({ id: privateShareLinks.id, encryptedPayload: privateShareLinks.encryptedPayload })
  if (!link) return jsonNoStore({ error: { code: 'LINK_UNAVAILABLE' } }, 404)
  await db.insert(privateShareLinkUses).values({ id: crypto.randomUUID(), linkId: link.id })
  return jsonNoStore({ encryptedPayload: link.encryptedPayload })
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { token } = await params
  if (!z.string().uuid().safeParse(token).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const [revoked] = await db.update(privateShareLinks).set({ revokedAt: new Date() })
    .where(and(eq(privateShareLinks.id, token), eq(privateShareLinks.ownerId, session.user.id), isNull(privateShareLinks.revokedAt)))
    .returning({ id: privateShareLinks.id, vaultId: privateShareLinks.vaultId })
  if (!revoked) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId: revoked.vaultId, event: 'private_share_link_revoked', targetKind: 'private_link', targetId: revoked.id })
  return jsonNoStore({ revoked: true })
}
