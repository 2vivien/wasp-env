import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { jsonNoStore, hasValidMutationHeaders } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, vaultItems } from '@/lib/db/schema'
import { getVaultAccess } from '@/lib/vault-access'

const encryptedBlobSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  nonce: z.string().min(16).max(32),
  ct: z.string().min(24).max(850_000),
}).strict()

const encryptedItemSchema = z.object({
  version: z.number().int().min(1),
  metadata: encryptedBlobSchema,
  value: encryptedBlobSchema,
}).strict()

const createItemSchema = z.object({
  id: z.string().uuid(),
  vaultId: z.string().uuid(),
  encryptedPayload: encryptedItemSchema,
}).strict()

export async function GET(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)

  const vaultId = new URL(request.url).searchParams.get('vaultId')
  if (!vaultId || !z.string().uuid().safeParse(vaultId).success) {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const access = await getVaultAccess(session.user.id, vaultId)
  if (!access) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)

  const items = await db.select({
    id: vaultItems.id,
    encryptedPayload: vaultItems.encryptedPayload,
    createdAt: vaultItems.createdAt,
  }).from(vaultItems).where(eq(vaultItems.vaultId, vaultId)).orderBy(vaultItems.createdAt)

  return jsonNoStore({ items })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const bodySize = new TextEncoder().encode(JSON.stringify(body) ?? '').byteLength
  if (bodySize > 1_048_576) return jsonNoStore({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)

  const parsed = createItemSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)

  const access = await getVaultAccess(session.user.id, parsed.data.vaultId)
  if (!access) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  if (access.permission !== 'write') return jsonNoStore({ error: { code: 'FORBIDDEN' } }, 403)

  await db.transaction(async (tx) => {
    await tx.insert(vaultItems).values({
      id: parsed.data.id,
      vaultId: parsed.data.vaultId,
      userId: access.ownerId,
      encryptedPayload: parsed.data.encryptedPayload,
    })
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId: parsed.data.vaultId, event: 'vault_item_created', targetKind: 'vault_item', targetId: parsed.data.id })
  })

  return jsonNoStore({ id: parsed.data.id }, 201)
}
