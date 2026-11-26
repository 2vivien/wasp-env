import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { privateShareLinkUses, privateShareLinks } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { token } = await params
  if (!z.string().uuid().safeParse(token).success)
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [link] = await db
    .select({ id: privateShareLinks.id })
    .from(privateShareLinks)
    .where(and(eq(privateShareLinks.id, token), eq(privateShareLinks.ownerId, session.user.id)))
    .limit(1)
  if (!link) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const rows = await db
    .select({
      usedAt: privateShareLinkUses.usedAt,
      clientFingerprintHash: privateShareLinkUses.clientFingerprintHash,
    })
    .from(privateShareLinkUses)
    .where(eq(privateShareLinkUses.linkId, token))
    .orderBy(desc(privateShareLinkUses.usedAt))
    .limit(200)
  return jsonNoStore({
    uses: rows.map((row) => ({
      usedAt: row.usedAt,
      device: row.clientFingerprintHash ? row.clientFingerprintHash.slice(0, 8) : null,
    })),
  })
}
