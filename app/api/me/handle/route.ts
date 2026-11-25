import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { jsonNoStore, hasValidMutationHeaders } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { isValidHandle, normalizeHandle } from '@/src/modules/identity/handle'

const requestSchema = z.object({ handle: z.string().min(3).max(20).refine(isValidHandle) }).strict()

export async function PUT(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  const existing = await db.select({ handle: profiles.handle }).from(profiles)
    .where(eq(profiles.userId, session.user.id)).limit(1)

  if (existing[0]?.handle) {
    if (existing[0].handle === parsed.data.handle) return jsonNoStore({ handle: parsed.data.handle })
    return jsonNoStore({ error: { code: 'HANDLE_LOCKED' } }, 409)
  }

  const created = await db.insert(profiles).values({
    userId: session.user.id,
    handle: parsed.data.handle,
    handleNormalized: normalizeHandle(parsed.data.handle),
    onboardingStep: 'passphrase',
  }).onConflictDoNothing().returning({ handle: profiles.handle })

  if (!created[0]) return jsonNoStore({ error: { code: 'HANDLE_TAKEN' } }, 409)
  return jsonNoStore({ handle: created[0].handle, onboardingStep: 'passphrase' }, 201)
}
