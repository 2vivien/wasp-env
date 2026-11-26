import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, environments, projects } from '@/lib/db/schema'

const encryptedMetadataSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal('A256GCM'),
    nonce: z.string().min(16).max(32),
    ct: z.string().min(16).max(12000),
  })
  .strict()

type RouteContext = { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { projectId } = await params
  const [project] = await db
    .select({
      id: projects.id,
      vaultId: projects.vaultId,
      encryptedMetadata: projects.encryptedMetadata,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, session.user.id),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1)
  return project ? jsonNoStore({ project }) : jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
}

export async function PATCH(request: Request, { params }: RouteContext) {
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
  const parsed = z.object({ encryptedMetadata: encryptedMetadataSchema }).strict().safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const { projectId } = await params
  const updated = await db.transaction(async (tx) => {
    const [project] = await tx
      .update(projects)
      .set({ encryptedMetadata: parsed.data.encryptedMetadata, updatedAt: new Date() })
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.userId, session.user.id),
          isNull(projects.deletedAt),
        ),
      )
      .returning({ id: projects.id, vaultId: projects.vaultId })
    if (!project) return null
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: session.user.id,
      vaultId: project.vaultId,
      event: 'project_updated',
      targetKind: 'project',
      targetId: project.id,
    })
    return project
  })
  if (!updated) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  return jsonNoStore({ updated: true })
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false))
    return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  const { projectId } = await params
  const deletedAt = new Date()
  const deleted = await db.transaction(async (tx) => {
    const [project] = await tx
      .update(projects)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.userId, session.user.id),
          isNull(projects.deletedAt),
        ),
      )
      .returning({ id: projects.id, vaultId: projects.vaultId })
    if (!project) return null

    await tx
      .update(environments)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(
        and(
          eq(environments.projectId, project.id),
          eq(environments.userId, session.user.id),
          isNull(environments.deletedAt),
        ),
      )
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: session.user.id,
      vaultId: project.vaultId,
      event: 'project_deleted',
      targetKind: 'project',
      targetId: project.id,
    })
    return project
  })
  if (!deleted) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  return jsonNoStore({ deleted: true })
}
