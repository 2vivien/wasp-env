import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCurrentSession } from '@/lib/auth/session'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { db } from '@/lib/db'
import { auditLogs, envFileVersions, envFiles, environments } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ environmentId: string }> }

export async function POST(request: Request, { params }: RouteContext) {
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
    .object({ version: z.number().int().min(1) })
    .strict()
    .safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [environment] = await db
    .select({ id: environments.id, vaultId: environments.vaultId })
    .from(environments)
    .where(and(eq(environments.id, environmentId), eq(environments.userId, session.user.id)))
    .limit(1)
  if (!environment) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const [snapshot] = await db
    .select({ encryptedLayout: envFileVersions.encryptedLayout })
    .from(envFileVersions)
    .where(
      and(
        eq(envFileVersions.environmentId, environmentId),
        eq(envFileVersions.userId, session.user.id),
        eq(envFileVersions.version, parsed.data.version),
      ),
    )
    .limit(1)
  if (!snapshot) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const [current] = await db
    .select({ id: envFiles.id, version: envFiles.version })
    .from(envFiles)
    .where(and(eq(envFiles.environmentId, environmentId), eq(envFiles.userId, session.user.id)))
    .limit(1)
  if (!current) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const nextVersion = current.version + 1
  await db.transaction(async (tx) => {
    await tx
      .insert(envFileVersions)
      .values({
        id: crypto.randomUUID(),
        environmentId,
        userId: session.user.id,
        version: current.version,
        encryptedLayout:
          (
            await tx
              .select({ encryptedLayout: envFiles.encryptedLayout })
              .from(envFiles)
              .where(eq(envFiles.id, current.id))
              .limit(1)
          )[0]?.encryptedLayout ?? snapshot.encryptedLayout,
      })
      .onConflictDoNothing()
    await tx
      .update(envFiles)
      .set({
        encryptedLayout: snapshot.encryptedLayout,
        version: nextVersion,
        updatedAt: new Date(),
      })
      .where(eq(envFiles.id, current.id))
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: session.user.id,
      vaultId: environment.vaultId,
      event: 'env_file_restored',
      targetKind: 'environment',
      targetId: environmentId,
      metadata: { version: parsed.data.version },
    })
  })
  return jsonNoStore({ version: nextVersion })
}
