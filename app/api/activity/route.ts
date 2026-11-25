import { and, desc, eq, lt } from 'drizzle-orm'
import { jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs } from '@/lib/db/schema'

export async function GET(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const cursor = url.searchParams.get('cursor')
  const cursorDate = cursor && !Number.isNaN(Date.parse(cursor)) ? new Date(cursor) : undefined
  const rows = await db.select({ id: auditLogs.id, event: auditLogs.event, targetKind: auditLogs.targetKind, targetId: auditLogs.targetId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt })
    .from(auditLogs).where(and(eq(auditLogs.actorId, session.user.id), ...(cursorDate ? [lt(auditLogs.createdAt, cursorDate)] : [])))
    .orderBy(desc(auditLogs.createdAt)).limit(limit + 1)
  const hasMore = rows.length > limit
  const page = rows.slice(0, limit)
  return jsonNoStore({ events: page, nextCursor: hasMore ? page.at(-1)?.createdAt.toISOString() ?? null : null })
}
