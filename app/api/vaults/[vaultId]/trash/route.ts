import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, vaults } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ vaultId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { vaultId } = await params
  if (!z.string().uuid().safeParse(vaultId).success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [vault] = await db.select({ kind: vaults.kind }).from(vaults)
    .where(and(eq(vaults.id, vaultId), eq(vaults.userId, session.user.id), isNull(vaults.deletedAt))).limit(1)
  if (!vault) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  if (vault.kind === 'personal') return jsonNoStore({ error: { code: 'PERSONAL_VAULT_PROTECTED' } }, 409)

  const [updated] = await db.update(vaults).set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(vaults.id, vaultId), eq(vaults.userId, session.user.id)))
    .returning({ id: vaults.id })
  if (!updated) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(), actorId: session.user.id, vaultId,
    event: 'vault_trashed', targetKind: 'vault', targetId: vaultId,
  })
  return jsonNoStore({ trashed: true })
}
