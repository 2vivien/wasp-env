import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profiles, vaults } from '@/lib/db/schema'
import { VaultWorkspace } from '@/components/vault/vault-workspace'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login?callbackURL=%2Fdashboard')

  const [profile] = await db.select({ handle: profiles.handle }).from(profiles)
    .where(eq(profiles.userId, session.user.id)).limit(1)
  if (!profile?.handle) redirect('/onboarding')

  const ownedVaults = await db.select({
    id: vaults.id,
    keySalt: vaults.keySalt,
    wrappedKey: vaults.wrappedKey,
    kdfParameters: vaults.kdfParameters,
  }).from(vaults).where(eq(vaults.userId, session.user.id)).limit(1)

  return (
    <VaultWorkspace
      userName={session.user.name}
      initialVault={ownedVaults[0] ?? null}
    />
  )
}
