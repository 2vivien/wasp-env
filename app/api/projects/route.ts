import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, projects, vaults } from '@/lib/db/schema'

const encryptedMetadataSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  nonce: z.string().min(16).max(32),
  ct: z.string().min(16).max(12000),
}).strict()

export async function GET() {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const rows = await db.select({
    id: projects.id,
    vaultId: projects.vaultId,
    encryptedMetadata: projects.encryptedMetadata,
    position: projects.position,
    createdAt: projects.createdAt,
    updatedAt: projects.updatedAt,
  }).from(projects).where(and(eq(projects.userId, session.user.id), isNull(projects.deletedAt)))
  return jsonNoStore({ projects: rows })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  let body: unknown
  try { body = await request.json() } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = z.object({
    id: z.string().uuid(),
    vaultId: z.string().uuid(),
    encryptedMetadata: encryptedMetadataSchema,
  }).strict().safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const [vault] = await db.select({ id: vaults.id }).from(vaults).where(and(
    eq(vaults.id, parsed.data.vaultId),
    eq(vaults.userId, session.user.id),
  )).limit(1)
  if (!vault) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  await db.transaction(async (tx) => {
    await tx.insert(projects).values({
      id: parsed.data.id,
      userId: session.user.id,
      vaultId: parsed.data.vaultId,
      encryptedMetadata: parsed.data.encryptedMetadata,
    })
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: session.user.id,
      vaultId: parsed.data.vaultId,
      event: 'project_created',
      targetKind: 'project',
      targetId: parsed.data.id,
    })
  })
  return jsonNoStore({ id: parsed.data.id }, 201)
}
