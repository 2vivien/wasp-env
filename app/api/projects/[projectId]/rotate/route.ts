import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  auditLogs,
  environments,
  envFiles,
  keyRotationJobs,
  privateShareLinks,
  projects,
  scopedKeyEnvelopes,
  scopedShares,
} from '@/lib/db/schema'
import { canCompleteRotation, rotationTargetCount } from '@/lib/project-rotation'

const blob = z
  .object({
    v: z.literal(1),
    alg: z.literal('A256GCM'),
    nonce: z.string().min(16).max(32),
    ct: z.string().min(16).max(800000),
  })
  .strict()
const versionSchema = z.object({
  expectedVersion: z.number().int().min(0),
  version: z.number().int().min(1),
})
const requestSchema = z
  .object({
    vaultId: z.string().uuid(),
    expectedScopeKeyVersion: z.number().int().min(1),
    nextScopeKeyVersion: z.number().int().min(2),
    project: versionSchema.extend({ encryptedMetadata: blob }),
    nextOwnerEnvelope: blob,
    environments: z.array(
      versionSchema.extend({
        id: z.string().uuid(),
        encryptedMetadata: blob,
      }),
    ),
    envFiles: z.array(
      versionSchema.extend({
        environmentId: z.string().uuid(),
        encryptedLayout: blob,
      }),
    ),
  })
  .strict()

type RouteContext = { params: Promise<{ projectId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) {
    return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  }
  const { projectId } = await params
  if (!z.string().uuid().safeParse(projectId).success) {
    return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }
  if (new TextEncoder().encode(JSON.stringify(body) ?? '').byteLength > 5 * 1024 * 1024) {
    return jsonNoStore({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  const input = parsed.data
  const increments = [input.project, ...input.environments, ...input.envFiles].every(
    (item) => item.version === item.expectedVersion + 1,
  )
  if (!increments || input.nextScopeKeyVersion !== input.expectedScopeKeyVersion + 1) {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const [project] = await db
    .select({ id: projects.id, vaultId: projects.vaultId })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.vaultId, input.vaultId),
        eq(projects.userId, session.user.id),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1)
  if (!project) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const [envelope] = await db
    .select({ keyVersion: scopedKeyEnvelopes.keyVersion })
    .from(scopedKeyEnvelopes)
    .where(
      and(
        eq(scopedKeyEnvelopes.resourceType, 'project'),
        eq(scopedKeyEnvelopes.resourceId, projectId),
        eq(scopedKeyEnvelopes.ownerId, session.user.id),
      ),
    )
    .orderBy(desc(scopedKeyEnvelopes.keyVersion))
    .limit(1)
  const currentVersion = envelope?.keyVersion ?? 1
  if (currentVersion !== input.expectedScopeKeyVersion) {
    return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
  }

  const [job] = await db
    .select({
      id: keyRotationJobs.id,
      fromVersion: keyRotationJobs.fromVersion,
      status: keyRotationJobs.status,
    })
    .from(keyRotationJobs)
    .where(
      and(
        eq(keyRotationJobs.resourceType, 'project'),
        eq(keyRotationJobs.resourceId, projectId),
        eq(keyRotationJobs.ownerId, session.user.id),
      ),
    )
    .orderBy(desc(keyRotationJobs.updatedAt))
    .limit(1)
  if (!canCompleteRotation(job, input.expectedScopeKeyVersion)) {
    return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
  }

  const environmentIds = input.environments.map((item) => item.id)
  const fileIds = input.envFiles.map((item) => item.environmentId)
  const [ownedEnvironments, ownedFiles] = await Promise.all([
    environmentIds.length
      ? db
          .select({ id: environments.id, version: environments.version })
          .from(environments)
          .where(
            and(
              eq(environments.projectId, projectId),
              eq(environments.userId, session.user.id),
              inArray(environments.id, environmentIds),
            ),
          )
      : Promise.resolve([]),
    fileIds.length
      ? db
          .select({ environmentId: envFiles.environmentId, version: envFiles.version })
          .from(envFiles)
          .where(
            and(eq(envFiles.userId, session.user.id), inArray(envFiles.environmentId, fileIds)),
          )
      : Promise.resolve([]),
  ])
  const expectedEnvironments = new Map(
    input.environments.map((item) => [item.id, item.expectedVersion]),
  )
  const expectedFiles = new Map(
    input.envFiles.map((item) => [item.environmentId, item.expectedVersion]),
  )
  if (
    ownedEnvironments.length !== environmentIds.length ||
    ownedFiles.length !== fileIds.length ||
    ownedEnvironments.some((row) => row.version !== expectedEnvironments.get(row.id)) ||
    ownedFiles.some((row) => row.version !== expectedFiles.get(row.environmentId))
  ) {
    return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
  }

  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(projects)
        .set({
          encryptedMetadata: input.project.encryptedMetadata,
          version: sql`${projects.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.userId, session.user.id),
            sql`${projects.version} = ${input.project.expectedVersion}`,
          ),
        )
        .returning({ id: projects.id })
      if (!updated.length) throw new Error('CONFLICT')

      for (const item of input.environments) {
        await tx
          .update(environments)
          .set({
            encryptedMetadata: item.encryptedMetadata,
            version: item.version,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(environments.id, item.id),
              eq(environments.projectId, projectId),
              eq(environments.userId, session.user.id),
              sql`${environments.version} = ${item.expectedVersion}`,
            ),
          )
      }
      for (const item of input.envFiles) {
        await tx
          .update(envFiles)
          .set({ encryptedLayout: item.encryptedLayout, version: item.version })
          .where(
            and(
              eq(envFiles.environmentId, item.environmentId),
              eq(envFiles.userId, session.user.id),
              sql`${envFiles.version} = ${item.expectedVersion}`,
            ),
          )
      }
      await tx
        .update(scopedShares)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(
          and(eq(scopedShares.resourceType, 'project'), eq(scopedShares.resourceId, projectId)),
        )
      await tx
        .update(privateShareLinks)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(privateShareLinks.resourceType, 'project'),
            eq(privateShareLinks.resourceId, projectId),
          ),
        )
      if (job) {
        await tx
          .update(keyRotationJobs)
          .set({
            status: 'completed',
            completedCount: rotationTargetCount({
              environments: input.environments.length,
              envFiles: input.envFiles.length,
            }),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(keyRotationJobs.id, job.id),
              eq(keyRotationJobs.ownerId, session.user.id),
              eq(keyRotationJobs.status, 'pending'),
            ),
          )
      }
      await tx
        .insert(scopedKeyEnvelopes)
        .values({
          id: crypto.randomUUID(),
          vaultId: project.vaultId,
          ownerId: session.user.id,
          resourceType: 'project',
          resourceId: projectId,
          keyVersion: input.nextScopeKeyVersion,
          ownerEnvelope: input.nextOwnerEnvelope,
        })
        .onConflictDoNothing()
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        vaultId: project.vaultId,
        event: 'project_key_rotated',
        targetKind: 'project',
        targetId: projectId,
        metadata: { keyVersion: input.nextScopeKeyVersion },
      })
    })
  } catch {
    return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
  }
  return jsonNoStore({ rotated: true, version: input.nextScopeKeyVersion })
}
