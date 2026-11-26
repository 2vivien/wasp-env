import { eq } from 'drizzle-orm'
import { jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { profiles, vaults } from '@/lib/db/schema'

export async function GET() {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)

  const [profile] = await db.select({
    handle: profiles.handle,
    displayName: profiles.displayName,
    avatarUrl: profiles.avatarUrl,
    bio: profiles.bio,
    onboardingStep: profiles.onboardingStep,
  }).from(profiles).where(eq(profiles.userId, session.user.id)).limit(1)
  const [vault] = await db.select({ id: vaults.id }).from(vaults)
    .where(eq(vaults.userId, session.user.id)).limit(1)

  return jsonNoStore({ userId: session.user.id, profile: profile ?? null, hasVaultKeys: Boolean(vault) })
}
