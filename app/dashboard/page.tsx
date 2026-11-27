import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profiles, vaults } from '@/lib/db/schema'
import { VaultWorkspace } from '@/components/vault/vault-workspace'
import { ServerErrorNotice } from '@/components/layout/server-error-notice'
import type { KdfParameters, WrappedVaultKey } from '@/src/crypto/vault-key'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  let session: Awaited<ReturnType<typeof auth.api.getSession>>
  try {
    session = await auth.api.getSession({ headers: await headers() })
  } catch {
    return <ServerErrorNotice retryHref="/login" />
  }
  if (!session?.user) redirect('/login?callbackURL=%2Fdashboard')

  let profile: { handle: string | null } | undefined
  let ownedVaults: Array<{
    id: string
    keySalt: string
    wrappedKey: WrappedVaultKey
    kdfParameters: KdfParameters
  }> = []
  try {
    ;[profile] = await db
      .select({ handle: profiles.handle })
      .from(profiles)
      .where(eq(profiles.userId, session.user.id))
      .limit(1)
    ownedVaults = await db
      .select({
        id: vaults.id,
        keySalt: vaults.keySalt,
        wrappedKey: vaults.wrappedKey,
        kdfParameters: vaults.kdfParameters,
      })
      .from(vaults)
      .where(eq(vaults.userId, session.user.id))
      .limit(1)
  } catch {
    return <ServerErrorNotice />
  }
  if (!profile?.handle) redirect('/onboarding')

  return <VaultWorkspace userName={session.user.name} initialVault={ownedVaults[0] ?? null} />
}
