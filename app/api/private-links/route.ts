import { and, eq } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, privateShareLinks, vaultItems } from '@/lib/db/schema'
import { hashPrivateLinkAccessCode } from '@/lib/private-link-security'
import { limitRequest } from '@/lib/rate-limit'

const encryptedPayloadSchema = z.object({ v: z.literal(1), alg: z.literal('A256GCM'), nonce: z.string().regex(/^[A-Za-z0-9_-]{16}$/), ct: z.string().min(22).max(200_000) }).strict()
const createSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  vaultId: z.string().uuid(),
  resourceId: z.string().uuid(),
  encryptedPayload: encryptedPayloadSchema,
  expiresAt: z.string().datetime({ offset: true }),
  maxUses: z.number().int().min(1).max(1000),
  accessCode: z.string().min(12).max(128).optional(),
}).strict()

export async function GET() {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const links = await db.select({
    id: privateShareLinks.id, vaultId: privateShareLinks.vaultId, resourceType: privateShareLinks.resourceType,
    resourceId: privateShareLinks.resourceId, maxUses: privateShareLinks.maxUses, useCount: privateShareLinks.useCount,
    expiresAt: privateShareLinks.expiresAt, revokedAt: privateShareLinks.revokedAt, createdAt: privateShareLinks.createdAt,
  }).from(privateShareLinks).where(eq(privateShareLinks.ownerId, session.user.id)).orderBy(privateShareLinks.createdAt)
  return jsonNoStore({ links })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const limit = await limitRequest(request, 'link-creation', 30, 3600).catch(() => ({ allowed: true, remaining: 30 }))
  if (!limit.allowed) return jsonNoStore({ error: { code: 'RATE_LIMITED' } }, 429)
  let body: unknown
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 256_000) return jsonNoStore({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)
    body = JSON.parse(rawBody)
  } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  const { token, vaultId, resourceId, encryptedPayload, expiresAt, maxUses, accessCode } = parsed.data
  const expires = new Date(expiresAt)
  const accessCodeHash = accessCode ? await hashPrivateLinkAccessCode(accessCode) : null
  if (expires <= new Date() || expires > new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)) return jsonNoStore({ error: { code: 'INVALID_EXPIRATION' } }, 422)
  const [item] = await db.select({ id: vaultItems.id }).from(vaultItems).where(and(
    eq(vaultItems.id, resourceId), eq(vaultItems.vaultId, vaultId), eq(vaultItems.userId, session.user.id),
  )).limit(1)
  if (!item) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const id = crypto.randomUUID()
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await db.transaction(async (tx) => {
    await tx.insert(privateShareLinks).values({
      id, tokenHash, ownerId: session.user.id, vaultId, resourceType: 'secret', resourceId,
      encryptedPayload, permissions: { read: true }, accessCodeHash, expiresAt: expires, maxUses,
    })
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId, event: 'private_share_link_created', targetKind: 'private_link', targetId: id })
  })
  return jsonNoStore({ id, expiresAt: expires.toISOString(), maxUses }, 201)
}
