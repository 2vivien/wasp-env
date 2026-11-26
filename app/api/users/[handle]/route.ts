import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { profiles, userKeyMaterial } from '@/lib/db/schema'
import { normalizeHandle } from '@/src/modules/identity/handle'

type RouteContext = { params: Promise<{ handle: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { handle } = await params
  if (!z.string().min(3).max(20).safeParse(handle).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const [row] = await db.select({
    userId: profiles.userId,
    handle: profiles.handle,
    displayName: profiles.displayName,
    publicKeyX25519: userKeyMaterial.publicKeyX25519,
  }).from(profiles)
    .innerJoin(userKeyMaterial, eq(userKeyMaterial.userId, profiles.userId))
    .where(eq(profiles.handleNormalized, normalizeHandle(handle))).limit(1)
  if (!row || row.userId === session.user.id) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const digest = createHash('sha256').update(row.publicKeyX25519).digest('hex').slice(0, 16).toUpperCase()
  const fingerprint = digest.match(/.{1,4}/g)?.join('-') ?? ''
  return jsonNoStore({ handle: row.handle, displayName: row.displayName, publicKeyX25519: row.publicKeyX25519, fingerprint })
}
