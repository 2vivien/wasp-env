import { asc, like } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { jsonNoStore } from '@/lib/api'
import { limitRequest } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { normalizeHandle } from '@/src/modules/identity/handle'

export async function GET(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const limit = await limitRequest(request, 'users-search', 30, 60).catch(() => ({ allowed: true, remaining: 30 }))
  if (!limit.allowed) return jsonNoStore({ error: { code: 'RATE_LIMITED' } }, 429)
  const query = new URL(request.url).searchParams.get('q') ?? ''
  const parsed = z.string().min(2).max(20).safeParse(normalizeHandle(query))
  if (!parsed.success) return jsonNoStore({ users: [] })

  const rows = await db.select({
    handle: profiles.handle,
    displayName: profiles.displayName,
  }).from(profiles)
    .where(like(profiles.handleNormalized, `${parsed.data}%`))
    .orderBy(asc(profiles.handle))
    .limit(20)
  return jsonNoStore({ users: rows })
}
