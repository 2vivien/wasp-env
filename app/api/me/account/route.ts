import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { user, vaultItems, vaults } from '@/lib/db/schema'

const deleteAccountSchema = z.object({ confirmation: z.string().email().max(320) }).strict()

export async function DELETE(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  }

  const parsed = deleteAccountSchema.safeParse(body)
  if (!parsed.success || parsed.data.confirmation.trim().toLowerCase() !== session.user.email.toLowerCase()) {
    return jsonNoStore({ error: { code: 'CONFIRMATION_REQUIRED' } }, 422)
  }

  await db.transaction(async (tx) => {
    await tx.delete(vaultItems).where(eq(vaultItems.userId, session.user.id))
    await tx.delete(vaults).where(eq(vaults.userId, session.user.id))
    await tx.delete(user).where(eq(user.id, session.user.id))
  })

  return jsonNoStore({ deleted: true })
}
