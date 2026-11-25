import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { jsonNoStore, hasValidMutationHeaders } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(50).nullable().optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
  bio: z.string().max(160).nullable().optional(),
}).strict().refine((profile) => Object.keys(profile).length > 0)

export async function PATCH(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const parsed = profileSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  const [updated] = await db.update(profiles).set({
    ...parsed.data,
    updatedAt: new Date(),
  }).where(eq(profiles.userId, session.user.id)).returning({ userId: profiles.userId })

  if (!updated) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  return jsonNoStore({ updated: true })
}
