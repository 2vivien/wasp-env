import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { jsonNoStore, hasValidMutationHeaders } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, profiles, reservedHandles } from '@/lib/db/schema'
import { LIMITS } from '@/lib/limits'
import {
  canChangeHandle,
  handleChangeRetryAt,
  isValidHandle,
  normalizeHandle,
} from '@/src/modules/identity/handle'

const requestSchema = z.object({ handle: z.string().min(3).max(20).refine(isValidHandle) }).strict()

export async function PUT(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true))
    return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  const normalized = normalizeHandle(parsed.data.handle)
  const now = new Date()
  const [existing] = await db
    .select({
      handle: profiles.handle,
      handleChangedAt: profiles.handleChangedAt,
    })
    .from(profiles)
    .where(eq(profiles.userId, session.user.id))
    .limit(1)

  if (!existing?.handle) {
    const created = await db
      .insert(profiles)
      .values({
        userId: session.user.id,
        handle: parsed.data.handle,
        handleNormalized: normalized,
        onboardingStep: 'passphrase',
      })
      .onConflictDoNothing()
      .returning({ handle: profiles.handle })
    if (!created[0]) return jsonNoStore({ error: { code: 'HANDLE_TAKEN' } }, 409)
    return jsonNoStore({ handle: created[0].handle, onboardingStep: 'passphrase' }, 201)
  }

  if (existing.handle === parsed.data.handle) return jsonNoStore({ handle: parsed.data.handle })
  if (!canChangeHandle(existing.handleChangedAt, now)) {
    const retryAt = existing.handleChangedAt
      ? handleChangeRetryAt(existing.handleChangedAt, now)
      : now
    return jsonNoStore(
      { error: { code: 'HANDLE_CHANGE_COOLDOWN', retryAt: retryAt.toISOString() } },
      409,
    )
  }

  const [taken] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.handleNormalized, normalized))
    .limit(1)
  const [reserved] = await db
    .select({ handleNormalized: reservedHandles.handleNormalized })
    .from(reservedHandles)
    .where(
      and(
        eq(reservedHandles.handleNormalized, normalized),
        or(isNull(reservedHandles.reservedUntil), gt(reservedHandles.reservedUntil, now)),
      ),
    )
    .limit(1)
  if ((taken && taken.userId !== session.user.id) || reserved) {
    return jsonNoStore({ error: { code: 'HANDLE_TAKEN' } }, 409)
  }

  const previousHandle = existing.handle
  await db.transaction(async (tx) => {
    await tx
      .insert(reservedHandles)
      .values({
        handleNormalized: normalizeHandle(previousHandle),
        userId: session.user.id,
        reservedUntil: new Date(now.getTime() + LIMITS.handleReservationMs),
      })
      .onConflictDoUpdate({
        target: reservedHandles.handleNormalized,
        set: {
          userId: session.user.id,
          reservedUntil: new Date(now.getTime() + LIMITS.handleReservationMs),
        },
      })
    await tx
      .update(profiles)
      .set({
        handle: parsed.data.handle,
        handleNormalized: normalized,
        handleChangedAt: now,
        updatedAt: now,
      })
      .where(eq(profiles.userId, session.user.id))
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: session.user.id,
      event: 'handle_changed',
      targetKind: 'profile',
      targetId: session.user.id,
      metadata: { count: 1 },
    })
  })
  return jsonNoStore({ handle: parsed.data.handle, handleChangedAt: now.toISOString() })
}
