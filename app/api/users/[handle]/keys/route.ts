import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { profiles, userKeyMaterial } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ handle: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { handle } = await params
  const parsed = z.string().min(3).max(32).safeParse(handle)
  if (!parsed.success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const [row] = await db.select({ userId: userKeyMaterial.userId, publicKeyX25519: userKeyMaterial.publicKeyX25519 })
    .from(profiles).innerJoin(userKeyMaterial, eq(profiles.userId, userKeyMaterial.userId))
    .where(eq(profiles.handleNormalized, parsed.data.toLowerCase())).limit(1)
  if (!row || row.userId === session.user.id) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  return jsonNoStore({ publicKeyX25519: row.publicKeyX25519 })
}
