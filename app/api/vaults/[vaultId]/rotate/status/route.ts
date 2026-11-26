import { and, desc, eq } from 'drizzle-orm'
import { getCurrentSession } from '@/lib/auth/session'
import { jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { keyRotationJobs } from '@/lib/db/schema'
import { getVaultAccess } from '@/lib/vault-access'

type RouteContext = { params: Promise<{ vaultId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { vaultId } = await params
  const access = await getVaultAccess(session.user.id, vaultId)
  if (!access) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const [job] = await db.select({
    id: keyRotationJobs.id, status: keyRotationJobs.status,
    fromVersion: keyRotationJobs.fromVersion, toVersion: keyRotationJobs.toVersion,
    completedCount: keyRotationJobs.completedCount, totalCount: keyRotationJobs.totalCount,
    updatedAt: keyRotationJobs.updatedAt,
  }).from(keyRotationJobs)
    .where(and(eq(keyRotationJobs.vaultId, vaultId), eq(keyRotationJobs.ownerId, access.ownerId)))
    .orderBy(desc(keyRotationJobs.updatedAt)).limit(1)
  return job ? jsonNoStore({ job }) : jsonNoStore({ job: null })
}
