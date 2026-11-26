import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, envFileVersions, envFiles, environments } from '@/lib/db/schema'

const encryptedBlobSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal('A256GCM'),
    nonce: z.string().min(16).max(32),
    ct: z.string().min(16).max(800000),
  })
  .strict()
type RouteContext = { params: Promise<{ environmentId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { environmentId } = await params
  const [environment] = await db
    .select({ id: environments.id })
    .from(environments)
    .where(
      and(
        eq(environments.id, environmentId),
        eq(environments.userId, session.user.id),
        isNull(environments.deletedAt),
      ),
    )
    .limit(1)
  if (!environment) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const [file] = await db
    .select({
      id: envFiles.id,
      encryptedLayout: envFiles.encryptedLayout,
      version: envFiles.version,
      updatedAt: envFiles.updatedAt,
    })
    .from(envFiles)
    .where(and(eq(envFiles.environmentId, environmentId), eq(envFiles.userId, session.user.id)))
    .limit(1)
  return file ? jsonNoStore(file) : jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
}

export async function PUT(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true))
    return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { environmentId } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }
  const parsed = z
    .object({
      encryptedLayout: encryptedBlobSchema,
      expectedVersion: z.number().int().min(0).max(100000),
    })
    .strict()
    .safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  const [environment] = await db
    .select({ id: environments.id, vaultId: environments.vaultId })
    .from(environments)
    .where(
      and(
        eq(environments.id, environmentId),
        eq(environments.userId, session.user.id),
        isNull(environments.deletedAt),
      ),
    )
    .limit(1)
  if (!environment) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const [current] = await db
    .select({
      id: envFiles.id,
      version: envFiles.version,
      encryptedLayout: envFiles.encryptedLayout,
    })
    .from(envFiles)
    .where(and(eq(envFiles.environmentId, environmentId), eq(envFiles.userId, session.user.id)))
    .limit(1)
  if (!current) {
    if (parsed.data.expectedVersion !== 0) return jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
    await db.transaction(async (tx) => {
      await tx.insert(envFiles).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        environmentId,
        encryptedLayout: parsed.data.encryptedLayout,
        version: 1,
      })
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        vaultId: environment.vaultId,
        event: 'env_file_created',
        targetKind: 'environment',
        targetId: environmentId,
      })
    })
    return jsonNoStore({ version: 1 }, 201)
  }
  if (current.version !== parsed.data.expectedVersion)
    return jsonNoStore({ error: { code: 'CONFLICT', currentVersion: current.version } }, 409)
  const updated = await db.transaction(async (tx) => {
    await tx
      .insert(envFileVersions)
      .values({
        id: crypto.randomUUID(),
        environmentId,
        userId: session.user.id,
        version: current.version,
        encryptedLayout: current.encryptedLayout,
      })
      .onConflictDoNothing()
    const [row] = await tx
      .update(envFiles)
      .set({
        encryptedLayout: parsed.data.encryptedLayout,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(envFiles.id, current.id),
          eq(envFiles.userId, session.user.id),
          eq(envFiles.version, current.version),
        ),
      )
      .returning({ version: envFiles.version })
    if (row)
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        vaultId: environment.vaultId,
        event: 'env_file_updated',
        targetKind: 'environment',
        targetId: environmentId,
      })
    return row
  })
  return updated ? jsonNoStore(updated) : jsonNoStore({ error: { code: 'CONFLICT' } }, 409)
}
