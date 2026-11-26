import { eq } from 'drizzle-orm'
import { jsonNoStore } from '@/lib/api'
import { limitRequest } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { isValidHandle, normalizeHandle } from '@/src/modules/identity/handle'

export async function GET(request: Request) {
  const limit = await limitRequest(request, 'handles-check', 30, 60).catch(() => ({ allowed: true, remaining: 30 }))
  if (!limit.allowed) return jsonNoStore({ error: { code: 'RATE_LIMITED' } }, 429)
  const handle = new URL(request.url).searchParams.get('h') ?? ''
  const normalized = normalizeHandle(handle)
  if (!isValidHandle(normalized)) return jsonNoStore({ available: false }, 422)

  const [existing] = await db.select({ userId: profiles.userId }).from(profiles)
    .where(eq(profiles.handleNormalized, normalized)).limit(1)
  await new Promise((resolve) => setTimeout(resolve, 120))
  return jsonNoStore({ available: !existing })
}
