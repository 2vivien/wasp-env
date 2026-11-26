import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, keyRotationJobs, vaults } from '@/lib/db/schema'
import { can } from '@/lib/permissions'
import { getVaultAccess } from '@/lib/vault-access'

type RouteContext = { params: Promise<{ vaultId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { vaultId } = await params
  const access = await getVaultAccess(session.user.id, vaultId)
  if (!access || !can(access.role, 'manage', access.permissions)) return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)

  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = z.object({
    jobId: z.string().uuid(),
    expectedVersion: z.number().int().min(1),
    completedCount: z.number().int().min(0),
  }).strict().safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [job] = await db.select().from(keyRotationJobs)
    .where(and(eq(keyRotationJobs.id, parsed.data.jobId), eq(keyRotationJobs.vaultId, vaultId))).limit(1)
  if (!job || job.status === 'completed') return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
  if (job.fromVersion !== parsed.data.expectedVersion) return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)

  const total = job.totalCount ?? parsed.data.completedCount
  const done = parsed.data.completedCount >= total
  await db.transaction(async (tx) => {
    await tx.update(keyRotationJobs).set({
      status: done ? 'completed' : 'running',
      completedCount: parsed.data.completedCount,
      updatedAt: new Date(),
    }).where(eq(keyRotationJobs.id, job.id))
    if (done) {
      await tx.update(vaults).set({ keyVersion: job.toVersion, updatedAt: new Date() })
        .where(and(eq(vaults.id, vaultId), eq(vaults.keyVersion, job.fromVersion)))
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(), actorId: session.user.id, vaultId,
        event: 'vault_rotation_completed', targetKind: 'vault', targetId: vaultId,
        metadata: { keyVersion: job.toVersion },
      })
    }
  })
  return jsonNoStore({ completed: done, completedCount: parsed.data.completedCount, total })
}
