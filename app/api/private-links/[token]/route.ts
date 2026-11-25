import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, privateShareLinkUses, privateShareLinks } from '@/lib/db/schema'
import { isPrivateLinkRateLimited, privateLinkClientKey, verifyPrivateLinkAccessCode } from '@/lib/private-link-security'

type RouteContext = { params: Promise<{ token: string }> }
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const accessCodeSchema = z.object({ accessCode: z.string().min(12).max(128).optional() }).strict()

async function consumeLink(tokenHash: string, accessCodeHash?: string) {
  const now = new Date()
  const codeCondition = accessCodeHash ? eq(privateShareLinks.accessCodeHash, accessCodeHash) : isNull(privateShareLinks.accessCodeHash)
  const [link] = await db.update(privateShareLinks).set({ useCount: sql`${privateShareLinks.useCount} + 1` })
    .where(and(
      eq(privateShareLinks.tokenHash, tokenHash), codeCondition, isNull(privateShareLinks.revokedAt),
      or(isNull(privateShareLinks.expiresAt), gt(privateShareLinks.expiresAt, now)),
      or(isNull(privateShareLinks.maxUses), sql`${privateShareLinks.useCount} < ${privateShareLinks.maxUses}`),
    )).returning({ id: privateShareLinks.id, vaultId: privateShareLinks.vaultId, encryptedPayload: privateShareLinks.encryptedPayload })
  if (!link) return null
  await db.insert(privateShareLinkUses).values({ id: crypto.randomUUID(), linkId: link.id })
  return link
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { token } = await params
  if (!tokenSchema.safeParse(token).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const [link] = await db.select({ requiresAccessCode: sql<boolean>`${privateShareLinks.accessCodeHash} IS NOT NULL` })
    .from(privateShareLinks).where(and(
      eq(privateShareLinks.tokenHash, tokenHash), isNull(privateShareLinks.revokedAt),
      or(isNull(privateShareLinks.expiresAt), gt(privateShareLinks.expiresAt, new Date())),
      or(isNull(privateShareLinks.maxUses), sql`${privateShareLinks.useCount} < ${privateShareLinks.maxUses}`),
    )).limit(1)
  return link ? jsonNoStore({ requiresAccessCode: link.requiresAccessCode }) : jsonNoStore({ error: { code: 'LINK_UNAVAILABLE' } }, 404)
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { token } = await params
  if (!tokenSchema.safeParse(token).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 1024) return jsonNoStore({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)
  let body: unknown
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 1024) return jsonNoStore({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)
    body = JSON.parse(rawBody)
  } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = accessCodeSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const [link] = await db.select({ id: privateShareLinks.id, accessCodeHash: privateShareLinks.accessCodeHash }).from(privateShareLinks).where(and(
    eq(privateShareLinks.tokenHash, tokenHash), isNull(privateShareLinks.revokedAt),
    or(isNull(privateShareLinks.expiresAt), gt(privateShareLinks.expiresAt, new Date())),
    or(isNull(privateShareLinks.maxUses), sql`${privateShareLinks.useCount} < ${privateShareLinks.maxUses}`),
  )).limit(1)
  if (!link) return jsonNoStore({ error: { code: 'LINK_UNAVAILABLE' } }, 404)
  if (link.accessCodeHash) {
    if (!parsed.data.accessCode) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
    try {
      if (await isPrivateLinkRateLimited(tokenHash, privateLinkClientKey(request))) {
        return jsonNoStore({ error: { code: 'TOO_MANY_ATTEMPTS' } }, 429)
      }
      const validCode = await verifyPrivateLinkAccessCode(parsed.data.accessCode, link.accessCodeHash)
      if (!validCode) return jsonNoStore({ error: { code: 'INVALID_ACCESS_CODE' } }, 401)
    } catch {
      return jsonNoStore({ error: { code: 'RATE_LIMIT_UNAVAILABLE' } }, 503)
    }
  }

  const consumed = await consumeLink(tokenHash, link.accessCodeHash ?? undefined)
  return consumed ? jsonNoStore({ encryptedPayload: consumed.encryptedPayload }) : jsonNoStore({ error: { code: 'LINK_UNAVAILABLE' } }, 404)
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
