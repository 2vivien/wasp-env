import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { vaultItemVersions } from '@/lib/db/schema'
import { can } from '@/lib/permissions'
import { getVaultAccess } from '@/lib/vault-access'

type RouteContext = { params: Promise<{ itemId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { itemId } = await params
  if (!z.string().uuid().safeParse(itemId).success) {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const [item] = await db
    .select({ vaultId: vaultItemVersions.vaultId })
    .from(vaultItemVersions)
    .where(eq(vaultItemVersions.itemId, itemId))
    .limit(1)
  if (!item) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const access = await getVaultAccess(session.user.id, item.vaultId)
  if (!access) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  if (!can(access.role, 'view', access.permissions)) {
    return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)
  }

  const versions = await db
    .select({
      version: vaultItemVersions.version,
      metadata: vaultItemVersions.metadata,
      value: vaultItemVersions.value,
      createdAt: vaultItemVersions.createdAt,
    })
    .from(vaultItemVersions)
    .where(and(eq(vaultItemVersions.itemId, itemId), eq(vaultItemVersions.userId, access.ownerId)))
    .orderBy(desc(vaultItemVersions.version))
    .limit(50)
  return jsonNoStore({ versions })
}
