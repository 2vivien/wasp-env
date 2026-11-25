import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, environments, projects } from '@/lib/db/schema'

const encryptedMetadataSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  nonce: z.string().min(16).max(32),
  ct: z.string().min(16).max(12000),
}).strict()
type RouteContext = { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { projectId } = await params
  const rows = await db.select({ id: environments.id, projectId: environments.projectId, vaultId: environments.vaultId, kind: environments.kind, encryptedMetadata: environments.encryptedMetadata, version: environments.version, updatedAt: environments.updatedAt })
    .from(environments).where(and(eq(environments.projectId, projectId), eq(environments.userId, session.user.id), isNull(environments.deletedAt)))
  return jsonNoStore({ environments: rows })
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { projectId } = await params
  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = z.object({ id: z.string().uuid(), kind: z.enum(['development', 'staging', 'production', 'testing', 'custom']), encryptedMetadata: encryptedMetadataSchema }).strict().safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [project] = await db.select({ id: projects.id, vaultId: projects.vaultId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id), isNull(projects.deletedAt))).limit(1)
  if (!project) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const current = await db.select({ id: environments.id }).from(environments).where(and(eq(environments.projectId, projectId), eq(environments.userId, session.user.id), isNull(environments.deletedAt))).limit(10)
  if (current.length >= 10) return jsonNoStore({ error: { code: 'ENVIRONMENT_LIMIT' } }, 422)
  await db.transaction(async (tx) => {
    await tx.insert(environments).values({ id: parsed.data.id, userId: session.user.id, vaultId: project.vaultId, projectId, kind: parsed.data.kind, encryptedMetadata: parsed.data.encryptedMetadata })
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: session.user.id,
      vaultId: project.vaultId,
      event: 'environment_created',
      targetKind: 'environment',
      targetId: parsed.data.id,
    })
  })
  return jsonNoStore({ id: parsed.data.id, projectId, version: 1 }, 201)
}
