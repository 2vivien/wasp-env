import { and, desc, eq } from 'drizzle-orm'
import { getCurrentSession } from '@/lib/auth/session'
import { jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { envFileVersions, environments } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ environmentId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { environmentId } = await params
  const [environment] = await db
    .select({ id: environments.id })
    .from(environments)
    .where(and(eq(environments.id, environmentId), eq(environments.userId, session.user.id)))
    .limit(1)
  if (!environment) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const rows = await db
    .select({
      version: envFileVersions.version,
      encryptedLayout: envFileVersions.encryptedLayout,
      createdAt: envFileVersions.createdAt,
    })
    .from(envFileVersions)
    .where(
      and(
        eq(envFileVersions.environmentId, environmentId),
        eq(envFileVersions.userId, session.user.id),
      ),
    )
    .orderBy(desc(envFileVersions.version))
    .limit(50)
  return jsonNoStore({ versions: rows })
}
