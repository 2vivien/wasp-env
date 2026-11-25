import { and, desc, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, session as sessions } from '@/lib/db/schema'

export async function GET() {
  const current = await getCurrentSession()
  if (!current?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const rows = await db.select({ id: sessions.id, createdAt: sessions.createdAt, updatedAt: sessions.updatedAt, expiresAt: sessions.expiresAt, userAgent: sessions.userAgent, ipAddress: sessions.ipAddress })
    .from(sessions).where(eq(sessions.userId, current.user.id)).orderBy(desc(sessions.updatedAt))
  return jsonNoStore({ sessions: rows.map((row) => ({ ...row, isCurrent: row.id === current.session.id, ipAddress: row.ipAddress ? `${row.ipAddress.split('.').slice(0, 2).join('.')}.x.x` : null })) })
}

export async function DELETE(request: Request) {
  const current = await getCurrentSession()
  if (!current?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = z.object({ sessionId: z.string().min(1).max(128).optional(), allOthers: z.boolean().optional() }).strict().safeParse(body)
  if (!parsed.success || (!parsed.data.sessionId && !parsed.data.allOthers)) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  if (parsed.data.sessionId === current.session.id) return jsonNoStore({ error: { code: 'CURRENT_SESSION' } }, 409)
  const deleted = await db.transaction(async (tx) => {
    const rows = await tx.delete(sessions).where(and(
      eq(sessions.userId, current.user.id),
      parsed.data.allOthers ? ne(sessions.id, current.session.id) : eq(sessions.id, parsed.data.sessionId ?? ''),
    )).returning({ id: sessions.id })
    if (rows.length) await tx.insert(auditLogs).values(rows.map((row) => ({
      id: crypto.randomUUID(), actorId: current.user.id, event: 'session_revoked', targetKind: 'session', targetId: row.id,
    })))
    return rows
  })
  return jsonNoStore({ revoked: deleted.length })
}
